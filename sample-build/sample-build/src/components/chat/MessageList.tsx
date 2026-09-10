"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { EmptyState } from "@/components/chat/EmptyState";
import type { DisplayMessage } from "@/hooks/useChat";

interface MessageListProps {
  messages: DisplayMessage[];
  isLoading: boolean;
  onPromptSelect: (prompt: string) => void;
}

export function MessageList({ messages, isLoading, onPromptSelect }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-[color:var(--color-accent)]" />
      </div>
    );
  }

  if (messages.length === 0) {
    return <EmptyState onPromptSelect={onPromptSelect} />;
  }

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
