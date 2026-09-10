import { z } from "zod";
import {
  createConversation,
  deriveTitle,
  finalizeAssistantMessage,
  getConversation,
  insertMessage,
  listMessages,
  touchConversation,
} from "@/lib/conversations";
import { NvidiaApiError, streamNvidiaChat, trimHistoryForContext } from "@/lib/nvidia-client";
import { getModelConfig, isKnownModel } from "@/lib/nvidia-models";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { MAX_ATTACHMENTS_PER_MESSAGE, isAllowedImageType } from "@/lib/uploads-config";
import type { Attachment, ChatStreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attachmentSchema = z.object({
  url: z.string().min(1).startsWith("/uploads/"),
  name: z.string().min(1).max(200),
  mimeType: z.string().refine(isAllowedImageType, "Unsupported image type."),
  size: z.number().int().positive(),
});

const chatRequestSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    content: z.string().max(8000),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
    model: z.string().refine(isKnownModel, "Unknown model."),
    temperature: z.number().min(0).max(2).default(0.7),
    reasoningEnabled: z.boolean().default(true),
  })
  .refine((data) => data.content.trim().length > 0 || data.attachments.length > 0, {
    message: "Message must include text or at least one image.",
  });

function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(`chat:${getClientKey(request)}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many requests. Please wait a moment before sending another message." },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const { conversationId, content, attachments, model, temperature, reasoningEnabled } = parsed.data;
  const modelConfig = getModelConfig(model);

  if (attachments.length > 0 && !modelConfig?.vision) {
    return Response.json(
      { error: `${modelConfig?.label ?? model} does not support image attachments.` },
      { status: 400 },
    );
  }

  const existingConversation = conversationId ? await getConversation(conversationId) : null;
  if (conversationId && !existingConversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  const conversation =
    existingConversation ??
    (await createConversation({ title: deriveTitle(content || "Image message"), model }));

  const userMessage = await insertMessage({
    conversationId: conversation.id,
    role: "user",
    content,
    attachments: attachments as Attachment[],
  });

  const historyIncludingUser = trimHistoryForContext(await listMessages(conversation.id));

  const assistantMessage = await insertMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: "",
    model,
  });

  await touchConversation(conversation.id, model);

  let accumulatedContent = "";
  let accumulatedReasoning = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encodeEvent({
          type: "start",
          conversationId: conversation.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
        }),
      );

      try {
        const result = await streamNvidiaChat({
          model,
          history: historyIncludingUser,
          systemPrompt: conversation.systemPrompt,
          temperature,
          reasoningEnabled,
          signal: request.signal,
          onEvent: (event) => {
            if (event.type === "content") {
              accumulatedContent += event.delta;
            } else {
              accumulatedReasoning += event.delta;
            }
            controller.enqueue(encodeEvent({ type: event.type, delta: event.delta }));
          },
        });

        await finalizeAssistantMessage(assistantMessage.id, {
          content: accumulatedContent,
          reasoning: accumulatedReasoning || null,
          status: "complete",
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        });

        controller.enqueue(
          encodeEvent({
            type: "done",
            finishReason: result.finishReason,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
          }),
        );
      } catch (error) {
        const aborted = request.signal.aborted;
        const message = aborted
          ? "Generation stopped."
          : error instanceof NvidiaApiError
            ? error.message
            : "The assistant failed to respond. Please try again.";

        await finalizeAssistantMessage(assistantMessage.id, {
          content: accumulatedContent,
          reasoning: accumulatedReasoning || null,
          status: aborted ? "stopped" : "error",
          errorMessage: aborted ? null : message,
        });

        if (!aborted) {
          controller.enqueue(encodeEvent({ type: "error", message }));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
