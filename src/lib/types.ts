export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  reasoning?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChatSettings {
  temperature: number;
  maxTokens: number;
  reasoningEffort: "low" | "high" | "max";
}

export const defaultSettings: ChatSettings = {
  temperature: 1,
  maxTokens: 16384,
  reasoningEffort: "max",
};
