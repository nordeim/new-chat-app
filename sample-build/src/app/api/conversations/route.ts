import { NextResponse } from "next/server";
import { z } from "zod";
import { createConversation, listConversations } from "@/lib/conversations";
import { DEFAULT_MODEL_ID, isKnownModel } from "@/lib/nvidia-models";

export const dynamic = "force-dynamic";

const createConversationSchema = z.object({
  model: z.string().optional(),
});

export async function GET() {
  const conversations = await listConversations();
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => ({}));
  const parsed = createConversationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const model = parsed.data.model && isKnownModel(parsed.data.model) ? parsed.data.model : DEFAULT_MODEL_ID;
  const conversation = await createConversation({ title: "New conversation", model });
  return NextResponse.json({ conversation }, { status: 201 });
}
