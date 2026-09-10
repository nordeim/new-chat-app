"use client";

import { useCallback, useRef, useState } from "react";
import { readNdjsonStream } from "@/lib/ndjson-stream";
import { deriveTitle } from "@/lib/text";
import { DEFAULT_MODEL_ID } from "@/lib/nvidia-models";
import type { Attachment, ChatMessage, ChatStreamEvent, Conversation } from "@/lib/types";

export interface DisplayMessage extends ChatMessage {
  pending?: boolean;
}

interface SendMessageInput {
  content: string;
  attachments: Attachment[];
}

const DEFAULT_TEMPERATURE = 0.7;

function nowIso() {
  return new Date().toISOString();
}

export function useChat(initialConversations: Conversation[]) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [reasoningEnabled, setReasoningEnabled] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = (await response.json()) as { conversations: Conversation[] };
      setConversations(data.conversations);
    } catch {
      // Non-fatal: the sidebar simply keeps its previous snapshot.
    }
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setIsLoadingMessages(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${id}`);
      if (!response.ok) throw new Error("Conversation not found.");
      const data = (await response.json()) as { conversation: Conversation; messages: ChatMessage[] };
      setMessages(data.messages);
      setModel(data.conversation.model);
      setTemperature(DEFAULT_TEMPERATURE);
      setReasoningEnabled(true);
    } catch {
      setError("Couldn't load that conversation. It may have been deleted.");
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const startNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setModel(DEFAULT_MODEL_ID);
    setTemperature(DEFAULT_TEMPERATURE);
    setReasoningEnabled(true);
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    setConversations((prev) => prev.map((conversation) => (conversation.id === id ? { ...conversation, title } : conversation)));
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch {
      setError("Failed to rename the conversation.");
      await refreshConversations();
    }
  }, [refreshConversations]);

  const removeConversation = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
      if (activeConversationId === id) {
        startNewConversation();
      }
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      } catch {
        setError("Failed to delete the conversation.");
        await refreshConversations();
      }
    },
    [activeConversationId, refreshConversations, startNewConversation],
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async ({ content, attachments }: SendMessageInput) => {
      if (isStreaming) return;
      setError(null);

      const tempUserId = `temp-user-${crypto.randomUUID()}`;
      const tempAssistantId = `temp-assistant-${crypto.randomUUID()}`;
      const conversationIdAtSend = activeConversationId;

      const optimisticUser: DisplayMessage = {
        id: tempUserId,
        conversationId: conversationIdAtSend ?? "",
        role: "user",
        content,
        reasoning: null,
        attachments,
        model: null,
        status: "complete",
        errorMessage: null,
        promptTokens: null,
        completionTokens: null,
        createdAt: nowIso(),
      };
      const optimisticAssistant: DisplayMessage = {
        id: tempAssistantId,
        conversationId: conversationIdAtSend ?? "",
        role: "assistant",
        content: "",
        reasoning: null,
        attachments: [],
        model,
        status: "complete",
        errorMessage: null,
        promptTokens: null,
        completionTokens: null,
        createdAt: nowIso(),
        pending: true,
      };

      setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);
      setIsStreaming(true);

      const isNewConversation = conversationIdAtSend === null;
      if (isNewConversation) {
        setConversations((prev) => [
          {
            id: `temp-conversation-${tempUserId}`,
            title: deriveTitle(content || "Image message"),
            model,
            systemPrompt: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          ...prev,
        ]);
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let resolvedAssistantId = tempAssistantId;
      let resolvedUserId = tempUserId;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationIdAtSend ?? undefined,
            content,
            attachments,
            model,
            temperature,
            reasoningEnabled,
          }),
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({ error: "Request failed." }));
          throw new Error(payload.error ?? "Request failed.");
        }

        for await (const event of readNdjsonStream<ChatStreamEvent>(response.body)) {
          if (event.type === "start") {
            resolvedUserId = event.userMessageId;
            resolvedAssistantId = event.assistantMessageId;
            if (isNewConversation) {
              setActiveConversationId(event.conversationId);
            }
            setMessages((prev) =>
              prev.map((message) => {
                if (message.id === tempUserId) {
                  return { ...message, id: resolvedUserId, conversationId: event.conversationId };
                }
                if (message.id === tempAssistantId) {
                  return { ...message, id: resolvedAssistantId, conversationId: event.conversationId };
                }
                return message;
              }),
            );
          } else if (event.type === "content") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === resolvedAssistantId
                  ? { ...message, content: message.content + event.delta }
                  : message,
              ),
            );
          } else if (event.type === "reasoning") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === resolvedAssistantId
                  ? { ...message, reasoning: (message.reasoning ?? "") + event.delta }
                  : message,
              ),
            );
          } else if (event.type === "done") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === resolvedAssistantId
                  ? {
                      ...message,
                      pending: false,
                      promptTokens: event.promptTokens,
                      completionTokens: event.completionTokens,
                    }
                  : message,
              ),
            );
          } else if (event.type === "error") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === resolvedAssistantId
                  ? { ...message, pending: false, status: "error", errorMessage: event.message }
                  : message,
              ),
            );
            setError(event.message);
          }
        }
      } catch (caught) {
        const aborted = caught instanceof DOMException && caught.name === "AbortError";
        setMessages((prev) =>
          prev.map((message) =>
            message.id === resolvedAssistantId
              ? {
                  ...message,
                  pending: false,
                  status: aborted ? "stopped" : "error",
                  errorMessage: aborted ? null : caught instanceof Error ? caught.message : "Something went wrong.",
                }
              : message,
          ),
        );
        if (!aborted) {
          setError(caught instanceof Error ? caught.message : "Something went wrong.");
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
        await refreshConversations();
      }
    },
    [activeConversationId, isStreaming, model, reasoningEnabled, refreshConversations, temperature],
  );

  return {
    conversations,
    activeConversationId,
    messages,
    isLoadingMessages,
    isStreaming,
    error,
    dismissError: () => setError(null),
    model,
    setModel,
    temperature,
    setTemperature,
    reasoningEnabled,
    setReasoningEnabled,
    selectConversation,
    startNewConversation,
    renameConversation,
    removeConversation,
    sendMessage,
    stopGeneration,
  };
}
