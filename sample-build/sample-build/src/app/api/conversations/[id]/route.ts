import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteConversation,
  getConversation,
  listMessages,
  renameConversation,
} from "@/lib/conversations";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const renameSchema = z.object({ title: z.string().trim().min(1).max(200) });

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  }

  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const messages = await listMessages(id);
  return NextResponse.json({ conversation, messages });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = renameSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "A non-empty title is required." }, { status: 400 });
  }

  const conversation = await renameConversation(id, parsed.data.title);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  }

  await deleteConversation(id);
  return NextResponse.json({ ok: true });
}
