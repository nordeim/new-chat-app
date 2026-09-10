import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { Attachment, ChatMessage, Conversation, MessageRole, MessageStatus } from "@/lib/types";
export { deriveTitle } from "@/lib/text";

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    systemPrompt: row.systemPrompt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning,
    attachments: row.attachments,
    model: row.model,
    status: row.status,
    errorMessage: row.errorMessage,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listConversations(limit = 100): Promise<Conversation[]> {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
  return rows.map(toConversation);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return row ? toConversation(row) : null;
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
  return rows.map(toChatMessage);
}

export async function createConversation(params: {
  title: string;
  model: string;
  systemPrompt?: string | null;
}): Promise<Conversation> {
  const [row] = await db
    .insert(conversations)
    .values({
      title: params.title,
      model: params.model,
      systemPrompt: params.systemPrompt ?? null,
    })
    .returning();
  return toConversation(row);
}

export async function renameConversation(id: string, title: string): Promise<Conversation | null> {
  const [row] = await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();
  return row ? toConversation(row) : null;
}

export async function touchConversation(id: string, model?: string): Promise<void> {
  await db
    .update(conversations)
    .set({ updatedAt: new Date(), ...(model ? { model } : {}) })
    .where(eq(conversations.id, id));
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, id));
}

export async function insertMessage(params: {
  conversationId: string;
  role: MessageRole;
  content: string;
  attachments?: Attachment[];
  model?: string | null;
  status?: MessageStatus;
}): Promise<ChatMessage> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      attachments: params.attachments ?? [],
      model: params.model ?? null,
      status: params.status ?? "complete",
    })
    .returning();
  return toChatMessage(row);
}

export async function finalizeAssistantMessage(
  id: string,
  update: {
    content: string;
    reasoning: string | null;
    status: MessageStatus;
    errorMessage?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
  },
): Promise<void> {
  await db
    .update(messages)
    .set({
      content: update.content,
      reasoning: update.reasoning,
      status: update.status,
      errorMessage: update.errorMessage ?? null,
      promptTokens: update.promptTokens ?? null,
      completionTokens: update.completionTokens ?? null,
    })
    .where(eq(messages.id, id));
}
