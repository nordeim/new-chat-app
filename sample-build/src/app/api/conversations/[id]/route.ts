import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { conversations, sessions } from "@/db/schema";
import {
  ApiError,
  assertOrigin,
  errorResponse,
  readJson,
  requireSession,
} from "@/lib/server";
import { idSchema, titleSchema } from "@/lib/validation";

interface Context {
  params: Promise<{ id: string }>;
}
async function identity(context: Context) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success)
    throw new ApiError(400, "Invalid conversation ID.");
  const owner = await requireSession();
  return {
    id,
    owner,
    condition: and(eq(conversations.id, id), eq(conversations.owner, owner)),
  };
}
export async function GET(_req: NextRequest, context: Context) {
  try {
    const { condition } = await identity(context);
    const [item] = await db.select().from(conversations).where(condition);
    if (!item) throw new ApiError(404, "This conversation was not found.");
    return NextResponse.json(
      {
        conversation: {
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt,
          messages: item.messages.map(
            ({ reasoning: _reasoning, ...message }) => message,
          ),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "conversations.read");
  }
}
export async function PATCH(req: NextRequest, context: Context) {
  try {
    assertOrigin(req);
    const { condition } = await identity(context);
    const parsed = titleSchema.safeParse(await readJson(req, 2048));
    if (!parsed.success)
      throw new ApiError(400, "Use a title between 1 and 100 characters.");
    const [item] = await db
      .update(conversations)
      .set({ title: parsed.data.title })
      .where(condition)
      .returning({ id: conversations.id, title: conversations.title });
    if (!item) throw new ApiError(404, "This conversation was not found.");
    return NextResponse.json(
      { id: item.id, title: item.title },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "conversations.rename");
  }
}
export async function DELETE(req: NextRequest, context: Context) {
  try {
    assertOrigin(req);
    const { condition, owner } = await identity(context);
    await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, owner), lt(sessions.busyUntil, new Date())))
        .for("update");
      if (!session)
        throw new ApiError(
          409,
          "Wait for the current response to finish before deleting a conversation.",
        );
      const [item] = await tx
        .delete(conversations)
        .where(condition)
        .returning({ id: conversations.id });
      if (!item) throw new ApiError(404, "This conversation was not found.");
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "conversations.delete");
  }
}
