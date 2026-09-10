"use client";

import { useState } from "react";
import { AlertTriangle, Brain, Check, Copy, OctagonX, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Markdown } from "@/components/chat/Markdown";
import { ImageLightbox } from "@/components/chat/ImageLightbox";
import { getModelConfig } from "@/lib/nvidia-models";
import type { DisplayMessage } from "@/hooks/useChat";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function MessageBubble({ message }: { message: DisplayMessage }) {
  const [copied, setCopied] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const isUser = message.role === "user";
  const isThinking = Boolean(message.pending) && message.content.length === 0;
  const modelLabel = message.model ? (getModelConfig(message.model)?.label ?? message.model) : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable; nothing else to do.
    }
  };

  return (
    <div className={clsx("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}>
      <div className={clsx("flex max-w-[46rem] flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
        {!isUser && (
          <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-slate-400">
            <Sparkles size={13} className="text-[color:var(--color-accent)]" />
            {modelLabel ?? "Assistant"}
          </div>
        )}

        {message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.attachments.map((attachment) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={attachment.url}
                src={attachment.url}
                alt={attachment.name}
                onClick={() => setLightboxSrc(attachment.url)}
                className="h-32 w-32 cursor-zoom-in rounded-xl border border-white/10 object-cover transition-opacity hover:opacity-90"
              />
            ))}
          </div>
        )}

        {(message.content.length > 0 || isThinking || message.status !== "complete") && (
          <div
            className={clsx(
              "rounded-2xl px-4 py-3 text-sm shadow-sm",
              isUser
                ? "bg-[color:var(--color-accent)] text-slate-950"
                : "border border-white/8 bg-slate-900/70 text-slate-100",
            )}
          >
            {!isUser && message.reasoning && (
              <details className="group mb-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-slate-300 open:pb-3">
                <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-slate-400 marker:content-none">
                  <Brain size={13} />
                  {message.pending ? "Thinking…" : "Reasoning"}
                </summary>
                <div className="chat-markdown mt-2 text-xs text-slate-400">
                  <Markdown content={message.reasoning} />
                </div>
              </details>
            )}

            {isThinking ? (
              <span className="flex items-center gap-1 text-slate-400">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
              </span>
            ) : isUser ? (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
              <div className={message.pending ? "streaming-caret" : undefined}>
                <Markdown content={message.content} />
              </div>
            )}

            {message.status === "error" && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {message.errorMessage ?? "The assistant failed to respond."}
              </p>
            )}
            {message.status === "stopped" && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <OctagonX size={13} />
                Generation stopped
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 px-1 text-[11px] text-slate-500">
          <span>{formatTime(message.createdAt)}</span>
          {!isUser && message.completionTokens != null && (
            <span>· {message.completionTokens} tokens</span>
          )}
          {!isUser && message.content.length > 0 && !message.pending && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded p-0.5 hover:text-slate-200"
              aria-label="Copy message"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
        </div>
      </div>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Attachment preview" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
