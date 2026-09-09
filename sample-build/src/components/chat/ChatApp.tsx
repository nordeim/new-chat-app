"use client";

import { useState } from "react";
import { AlertCircle, Menu, X } from "lucide-react";
import { Sidebar } from "@/components/chat/Sidebar";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { useChat } from "@/hooks/useChat";
import { getModelConfig } from "@/lib/nvidia-models";
import type { Conversation } from "@/lib/types";

export function ChatApp({ initialConversations }: { initialConversations: Conversation[] }) {
  const {
    conversations,
    activeConversationId,
    messages,
    isLoadingMessages,
    isStreaming,
    error,
    dismissError,
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
  } = useChat(initialConversations);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(undefined);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const title = activeConversation?.title ?? "New chat";
  const modelConfig = getModelConfig(model);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={(id) => {
          selectConversation(id);
          setIsSidebarOpen(false);
        }}
        onNew={() => {
          startNewConversation();
          setIsSidebarOpen(false);
        }}
        onRename={renameConversation}
        onDelete={removeConversation}
        open={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3 md:px-8">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open sidebar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-100 md:hidden"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-slate-100">{title}</h1>
            {modelConfig && <p className="truncate text-xs text-slate-500">{modelConfig.label}</p>}
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-300 md:px-8">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <p className="flex-1">{error}</p>
            <button type="button" onClick={dismissError} aria-label="Dismiss error" className="shrink-0 hover:text-red-100">
              <X size={15} />
            </button>
          </div>
        )}

        <MessageList
          messages={messages}
          isLoading={isLoadingMessages}
          onPromptSelect={(prompt) => setPendingPrompt(prompt)}
        />

        <Composer
          key={activeConversationId ?? "new"}
          model={model}
          onModelChange={setModel}
          temperature={temperature}
          onTemperatureChange={setTemperature}
          reasoningEnabled={reasoningEnabled}
          onReasoningEnabledChange={setReasoningEnabled}
          isStreaming={isStreaming}
          onSend={sendMessage}
          onStop={stopGeneration}
          initialText={pendingPrompt}
        />
      </div>
    </div>
  );
}
