import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { ApiError, ensureSession, errorResponse, setSession } from "@/lib/server";
import { createRateLimiter } from "@/lib/throttle";

export const dynamic = "force-dynamic";

// The ?q= search expands every owned conversation's JSONB messages array
// (inline image data included), so a scripted session can otherwise turn a
// one-time seeding campaign into sustained database CPU pressure (pass-9
// finding M-1). 10 searches per 10 s per session bounds that surface while
// staying far above anything the 250 ms-debounced dialog produces. Plain
// listing (no term) is a cheap indexed read and stays unlimited. State is
// process-local: effective for the single-instance deployment, and the
// database lease remains the authority for correctness-critical serialization.
const searchLimiter = createRateLimiter({ windowMs: 10_000, max: 10 });

// Searches match titles and message content. `%`/`_`/`\` in the term are
// escaped so users search for literal text, not LIKE patterns.
function searchPattern(term: string) {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function GET(req: NextRequest) {
  try {
    const { owner, token } = await ensureSession(req);
    const term = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
    if (term && !searchLimiter.allow(owner))
      throw new ApiError(
        429,
        "Search is running too frequently. Wait a moment and try again.",
      );
    const condition = term
      ? and(
          eq(conversations.owner, owner),
          or(
            ilike(conversations.title, searchPattern(term)),
            sql`exists (
              select 1
              from jsonb_array_elements(${conversations.messages}) as message
              where message->>'content' ilike ${searchPattern(term)}
            )`,
          ),
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
