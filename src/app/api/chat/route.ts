import { NextRequest } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, sessions } from "@/db/schema";
import {
  ApiError,
  assertOrigin,
  errorResponse,
  readJson,
  requireSession,
} from "@/lib/server";
import { chatInputSchema, providerChunkSchema } from "@/lib/validation";
import { SSEParser } from "@/lib/sse";
import { deriveTitle } from "@/lib/title";
import { startKeepAlive } from "@/lib/keepalive";
import {
  streamAbortKind,
  streamAbortLog,
  streamErrorLog,
} from "@/lib/stream-abort";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  let owner: string | undefined;
  let lease: Date | undefined;
  const release = async () => {
    if (owner && lease)
      await db
        .update(sessions)
        .set({ busyUntil: new Date(0) })
        .where(and(eq(sessions.id, owner), eq(sessions.busyUntil, lease)));
  };
  try {
    assertOrigin(req);
    owner = await requireSession();
    const parsed = chatInputSchema.safeParse(await readJson(req));
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid message.",
      );
    const input = parsed.data;
    const key = process.env.NVIDIA_API_KEY;
    if (!key)
      throw new ApiError(
        503,
        "Connect NVIDIA to start chatting. Add NVIDIA_API_KEY to your server environment, then restart the app. Your message is still here.",
      );
    if (input.image) {
      const bytes = Buffer.from(input.image.split(",")[1], "base64");
      const mime = input.image.slice(5, input.image.indexOf(";"));
      const valid =
        mime === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : mime === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes.toString("ascii", 0, 4) === "RIFF" &&
              bytes.toString("ascii", 8, 12) === "WEBP";
      if (!valid || bytes.length > 2 * 1024 * 1024)
        throw new ApiError(
          400,
          "Use a valid PNG, JPEG, or WebP image up to 2 MB.",
        );
    }
    const now = new Date();
    const isLongOutput = input.settings.maxTokens > 16384;
    const leaseMs = isLongOutput ? 615_000 : 195_000;
    const proposedLease = new Date(now.getTime() + leaseMs);
    const [claimed] = await db
      .update(sessions)
      .set({ busyUntil: proposedLease, lastRequest: now })
      .where(
        and(
          eq(sessions.id, owner),
          lt(sessions.busyUntil, now),
          lt(sessions.lastRequest, new Date(now.getTime() - 3000)),
        ),
      )
      .returning({ id: sessions.id });
    if (!claimed)
      throw new ApiError(
        429,
        "A response is already running, or messages were sent too quickly. Wait a moment and try again.",
      );
    lease = proposedLease;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.content,
      ...(input.image ? { image: input.image } : {}),
    };
    let conversation;
    if (input.conversationId) {
      [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.owner, owner),
          ),
        );
      if (!conversation)
        throw new ApiError(
          404,
          "This conversation was not found. Start a new chat.",
        );
      if (
        conversation.messages.length >= 60 ||
        JSON.stringify(conversation.messages).length > 16_000_000
      )
        throw new ApiError(
          400,
          "This conversation has reached its limit. Start a new chat to continue.",
        );
      const last = conversation.messages.at(-1);
      const messages =
        last?.role === "user" &&
        last.content === input.content &&
        last.image === input.image
          ? conversation.messages
          : [...conversation.messages, userMessage];
      [conversation] = await db
        .update(conversations)
        .set({ messages, updatedAt: now })
        .where(eq(conversations.id, conversation.id))
        .returning();
    } else {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(eq(conversations.owner, owner));
      if (count >= 100)
        throw new ApiError(
          400,
          "Your workspace has 100 conversations. Delete an older chat to make room.",
        );
      [conversation] = await db
        .insert(conversations)
        .values({
          owner,
          title: deriveTitle(input.content),
          messages: [userMessage],
        })
        .returning();
    }
    const saved = conversation;
    const aborter = new AbortController();
    const timeoutMs = isLongOutput ? 590_000 : 175_000;
    const signal = AbortSignal.any([
      aborter.signal,
      req.signal,
      AbortSignal.timeout(timeoutMs),
    ]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: object) => {
          if (!aborter.signal.aborted)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
            );
        };
        const assistant: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          reasoning: "",
        };
        // SSE comment frames while the provider has not answered yet: proxies
        // (Cloudflare ~100 s, nginx proxy_read_timeout 60 s default) tear down
        // idle connections before the route's provider timeout can deliver its
        // curated error, so a slow or hung provider must not leave the wire
        // silent. Comment frames are ignored by the browser-side SSEParser.
        let stopKeepAlive: () => void = () => {};
        try {
          send({
            type: "meta",
            conversation: {
              id: saved.id,
              title: saved.title,
              updatedAt: saved.updatedAt,
            },
          });
          stopKeepAlive = startKeepAlive(() => {
            if (aborter.signal.aborted) return;
            try {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
            } catch {
              // The stream errored (as opposed to cancel(), which aborts the
              // guard above): enqueueing into a errored controller throws.
              // Expected teardown — the finally below still clears the timer.
            }
          }, 15_000);
          const response = await fetch(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            {
              method: "POST",
              signal,
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
                Accept: "text/event-stream",
              },
              body: JSON.stringify({
                model: "moonshotai/kimi-k3",
                stream: true,
                temperature: input.settings.temperature,
                max_tokens: input.settings.maxTokens,
                reasoning_effort: input.settings.reasoningEffort,
                messages: saved.messages.map((message) => ({
                  role: message.role,
                  content: message.image
                    ? [
                        { type: "text", text: message.content },
                        {
                          type: "image_url",
                          image_url: { url: message.image },
                        },
                      ]
                    : message.content,
                  ...(message.role === "assistant" && message.reasoning
                    ? { reasoning_content: message.reasoning }
                    : {}),
                })),
              }),
            },
          );
          if (!response.ok || !response.body) {
            console.error(
              JSON.stringify({
                operation: "nvidia.connect",
                status: response.status,
                conversationId: saved.id,
              }),
            );
            await response.body?.cancel();
            throw new ApiError(
              502,
              response.status === 401 || response.status === 403
                ? "NVIDIA rejected the server API key. Check the key and model access in your NVIDIA account."
                : response.status === 429
                  ? "NVIDIA is busy or your quota was reached. Please wait and try again."
                  : "NVIDIA could not start the response. Try again shortly and check model availability.",
            );
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const parser = new SSEParser();
          let completed = false;
          let truncated = false;
          let thinkingSent = false;
          const consume = (events: string[]) => {
            for (const event of events) {
              if (event === "[DONE]") {
                completed = true;
                continue;
              }
              const chunk = providerChunkSchema.parse(JSON.parse(event));
              if (chunk.error) throw new Error("Provider stream error");
              const choice = chunk.choices?.[0];
              if (choice?.finish_reason) {
                completed = true;
                truncated = choice.finish_reason === "length";
              }
              if (choice?.delta?.reasoning_content) {
                assistant.reasoning += choice.delta.reasoning_content;
                if (!thinkingSent) {
                  send({ type: "thinking" });
                  thinkingSent = true;
                }
              }
              if (choice?.delta?.content) {
                assistant.content += choice.delta.content;
                send({ type: "delta", content: choice.delta.content });
              }
              if (
                assistant.content.length + (assistant.reasoning?.length ?? 0) >
                1_200_000
              )
                throw new Error("Response size limit exceeded");
            }
          };
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                consume(parser.push(decoder.decode()));
                consume(parser.finish());
                break;
              }
              consume(parser.push(decoder.decode(value, { stream: true })));
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
          if (!completed || !assistant.content)
            throw new ApiError(
              502,
              "The response ended before an answer was completed. Try again, or increase the output token limit in settings.",
            );
          if (truncated)
            assistant.content +=
              "\n\n*Response reached the output limit. Ask me to continue.*";
          // The 60-message / 16 MB caps were enforced on the user turn above;
          // the completed answer may push the stored array to 61 messages.
          // The lease serializes same-session sends, so the soft drift is at
          // most one message — persisting the finished answer beats dropping
          // it after the spend already happened.
          await db
            .update(conversations)
            .set({
              messages: [...saved.messages, assistant],
              updatedAt: new Date(),
            })
            .where(eq(conversations.id, saved.id));
          send({
            type: "done",
            message: {
              id: assistant.id,
              role: assistant.role,
              content: assistant.content,
            },
          });
        } catch (error) {
          const abortBy = streamAbortKind(error);
          if (abortBy) {
            // Expected teardown: the browser went away mid-stream (Stop,
            // refresh, tab close, navigation). Next.js aborts request.signal
            // with a named ResponseAborted error; an internal race can surface
            // the same disconnect as a default AbortError instead. Warn level
            // keeps these separable from genuine failures. partialChars is a
            // length, not content, and records how much was discarded.
            console.warn(
              streamAbortLog({
                operation: "chat.stream",
                conversationId: saved.id,
                abortBy,
                partialChars: assistant.content.length,
              }).line,
            );
          } else {
            console.error(
              streamErrorLog({
                operation: "chat.stream",
                conversationId: saved.id,
                errorType: error instanceof Error ? error.name : "UnknownError",
              }).line,
            );
          }
          try {
            send({
              type: "error",
              message:
                error instanceof ApiError
                  ? error.message
                  : signal.aborted
                    ? "The response was stopped or timed out. Your message is saved; you can try again."
                    : "The response was interrupted. Your message is saved; please try again.",
            });
          } catch {
            // The controller is already closed or errored (client teardown
            // without cancel()); the lease release below still runs.
          }
        } finally {
          stopKeepAlive();
          try {
            await release();
          } catch {
            console.error(
              JSON.stringify({
                operation: "chat.release",
                conversationId: saved.id,
              }),
            );
          }
          if (!aborter.signal.aborted) controller.close();
        }
      },
      cancel() {
        aborter.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    try {
      await release();
    } catch {
      console.error(JSON.stringify({ operation: "chat.release" }));
    }
    return errorResponse(error, "chat.create");
  }
}
