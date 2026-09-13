import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { ApiError, ensureSession, errorResponse, setSession } from "@/lib/server";
import { createRateLimiter } from "@/lib/throttle";

export const dynamic = "force-dynamic";

// The ?q= search is served by the database-maintained search_text column and
// its trigram GIN index (backlog B1), so the pass-9 JSONB-expansion
// amplification (M-1) is closed at the storage layer. The per-session limit
// below stays as defense-in-depth: sub-three-character terms cannot use
// trigram similarity and would degrade to sequential scans, and process-local
// state costs nothing. Plain listing (no term) is a cheap indexed read and
// stays unlimited.
const searchLimiter = createRateLimiter({ windowMs: 10_000, max: 10 });

// Searches match titles and message content. `%`/`_`/`\` in the term are
// escaped so users search for literal text, not LIKE patterns.
function searchPattern(term: string) {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function GET(req: NextRequest) {
  try {
    const { owner, token } = await ensureSession(req);
    // Trim, cap, and collapse whitespace runs: interior newlines in a term
    // must never span the title/content join boundary of search_text (the
    // dialog is single-line; crafted ?q= payloads are the only source).
    const term =
      (req.nextUrl.searchParams.get("q") ?? "")
        .trim()
        .slice(0, 200)
        .replace(/\s+/g, " ");
    if (term && !searchLimiter.allow(owner))
      throw new ApiError(
        429,
        "Search is running too frequently. Wait a moment and try again.",
      );
    const condition = term
      ? and(
          eq(conversations.owner, owner),
          // Backlog B1: the search corpus lives in the database-maintained
          // search_text column (title + message contents) so the trigram
          // GIN index serves the predicate instead of expanding every
          // conversation's JSONB messages. The per-session rate limit stays
          // as defense-in-depth: terms under three characters cannot use
          // trigram similarity and would degrade to sequential scans.
          ilike(conversations.searchText, searchPattern(term)),
        )
      : eq(conversations.owner, owner);
    const items = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(condition)
      .orderBy(desc(conversations.updatedAt))
      .limit(100);
    return setSession(
      NextResponse.json({
        conversations: items,
        configured: Boolean(process.env.NVIDIA_API_KEY),
      }),
      token,
      req,
    );
  } catch (error) {
    return errorResponse(error, "conversations.list");
  }
}
