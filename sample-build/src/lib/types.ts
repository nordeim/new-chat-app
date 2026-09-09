export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus = "complete" | "error" | "stopped";

export interface Attachment {
  /** Public path to the stored file, e.g. "/uploads/<uuid>.png" */
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  reasoning: string | null;
  attachments: Attachment[];
  model: string | null;
  status: MessageStatus;
  errorMessage: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: ChatMessage[];
}

/**
 * Newline-delimited JSON events streamed from POST /api/chat.
 * Each line in the response body is exactly one of these, JSON-encoded.
 */
export type ChatStreamEvent =
  | { type: "start"; conversationId: string; userMessageId: string; assistantMessageId: string }
  | { type: "content"; delta: string }
  | { type: "reasoning"; delta: string }
  | {
      type: "done";
      finishReason: string | null;
      promptTokens: number | null;
      completionTokens: number | null;
    }
  | { type: "error"; message: string };
