import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Attachment, ChatMessage } from "@/lib/types";
import { getModelConfig } from "@/lib/nvidia-models";

const NVIDIA_API_BASE_URL = process.env.NVIDIA_API_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const MAX_OUTPUT_TOKENS = Number(process.env.NVIDIA_MAX_OUTPUT_TOKENS ?? 4096);
const MAX_IMAGES_PER_MESSAGE = 5;

type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OpenAiMessage {
  role: "user" | "assistant" | "system";
  content: string | OpenAiContentPart[];
}

interface BuildPayloadOptions {
  model: string;
  history: ChatMessage[];
  systemPrompt: string | null;
  temperature: number;
  reasoningEnabled: boolean;
}

export interface NvidiaStreamEvent {
  type: "content" | "reasoning";
  delta: string;
}

export interface NvidiaStreamResult {
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

/**
 * Reads an attachment stored under public/uploads and returns it as a
 * data: URI so the NVIDIA API can read it even when this app is not
 * publicly reachable (e.g. local dev, sandboxed preview).
 */
async function attachmentToDataUrl(attachment: Attachment): Promise<string> {
  const relativePath = attachment.url.replace(/^\//, "");
  const absolutePath = path.join(process.cwd(), "public", relativePath);
  const buffer = await readFile(absolutePath);
  return `data:${attachment.mimeType};base64,${buffer.toString("base64")}`;
}

async function toOpenAiMessage(message: ChatMessage): Promise<OpenAiMessage> {
  if (message.role === "user" && message.attachments.length > 0) {
    const parts: OpenAiContentPart[] = [];
    if (message.content.trim().length > 0) {
      parts.push({ type: "text", text: message.content });
    }
    const images = message.attachments.slice(0, MAX_IMAGES_PER_MESSAGE);
    for (const attachment of images) {
      const dataUrl = await attachmentToDataUrl(attachment);
      parts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    return { role: "user", content: parts };
  }

  return { role: message.role, content: message.content };
}

const MAX_HISTORY_MESSAGES = 40;
const MAX_HISTORY_CHARS = 60_000;

/**
 * Bounds the conversation history sent to the model: keeps at most the last
 * MAX_HISTORY_MESSAGES messages, and trims further from the oldest end if
 * the combined text would be unreasonably large.
 */
export function trimHistoryForContext(history: ChatMessage[]): ChatMessage[] {
  let trimmed = history.slice(-MAX_HISTORY_MESSAGES);

  let totalChars = trimmed.reduce((sum, message) => sum + message.content.length, 0);
  while (totalChars > MAX_HISTORY_CHARS && trimmed.length > 1) {
    const [removed, ...rest] = trimmed;
    trimmed = rest;
    totalChars -= removed.content.length;
  }

  return trimmed;
}

export async function buildNvidiaMessages({
  history,
  systemPrompt,
}: Pick<BuildPayloadOptions, "history" | "systemPrompt">): Promise<OpenAiMessage[]> {
  const messages: OpenAiMessage[] = [];
  if (systemPrompt && systemPrompt.trim().length > 0) {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const message of history) {
    messages.push(await toOpenAiMessage(message));
  }
  return messages;
}

interface StreamChatParams extends BuildPayloadOptions {
  signal: AbortSignal;
  onEvent: (event: NvidiaStreamEvent) => void;
}

interface RawStreamChoice {
  delta?: {
    content?: string | null;
    reasoning_content?: string | null;
  };
  finish_reason?: string | null;
}

interface RawStreamChunk {
  choices?: RawStreamChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

export class NvidiaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "NvidiaApiError";
  }
}

export async function streamNvidiaChat({
  model,
  history,
  systemPrompt,
  temperature,
  reasoningEnabled,
  signal,
  onEvent,
}: StreamChatParams): Promise<NvidiaStreamResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new NvidiaApiError("NVIDIA_API_KEY is not configured on the server.", 500);
  }

  const modelConfig = getModelConfig(model);
  const messages = await buildNvidiaMessages({ history, systemPrompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens: MAX_OUTPUT_TOKENS,
  };

  if (modelConfig?.reasoningMode === "toggle") {
    body.chat_template_kwargs = { thinking: reasoningEnabled };
  }

  const response = await fetch(`${NVIDIA_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    throw new NvidiaApiError(
      `NVIDIA API request failed (${response.status}): ${errorText.slice(0, 500) || response.statusText}`,
      response.status,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason: string | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        for (const line of rawEvent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice("data:".length).trim();
          if (payload === "[DONE]") continue;

          let chunk: RawStreamChunk;
          try {
            chunk = JSON.parse(payload) as RawStreamChunk;
          } catch {
            continue;
          }

          const choice = chunk.choices?.[0];
          if (choice?.delta?.reasoning_content) {
            onEvent({ type: "reasoning", delta: choice.delta.reasoning_content });
          }
          if (choice?.delta?.content) {
            onEvent({ type: "content", delta: choice.delta.content });
          }
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
            completionTokens = chunk.usage.completion_tokens ?? completionTokens;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { finishReason, promptTokens, completionTokens };
}
