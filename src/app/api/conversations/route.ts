import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { ensureSession, errorResponse, setSession } from "@/lib/server";

export const dynamic = "force-dynamic";

// Searches match titles and message content. `%`/`_`/`\` in the term are
// escaped so users search for literal text, not LIKE patterns.
function searchPattern(term: string) {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function GET(req: NextRequest) {
  try {
    const { owner, token } = await ensureSession(req);
    const term = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
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
