import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { ensureSession, errorResponse, setSession } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const { owner, token } = await ensureSession(req);
    const items = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(eq(conversations.owner, owner))
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
