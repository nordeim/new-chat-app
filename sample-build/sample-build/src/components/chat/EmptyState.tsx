"use client";

import { ImagePlus, MessageCircle, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "Summarize the tradeoffs between REST and GraphQL for a new internal API.",
  "Draft a rollout plan for migrating a service to zero-downtime deployments.",
  "Explain vector databases to a non-technical stakeholder in three paragraphs.",
  "Write a Postgres query to find duplicate rows across two join keys.",
];

export function EmptyState({ onPromptSelect }: { onPromptSelect: (prompt: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--color-accent)]/15">
        <Sparkles className="text-[color:var(--color-accent)]" size={22} />
      </div>
      <h1 className="text-xl font-semibold text-slate-100">How can I help today?</h1>
      <p className="mt-1.5 max-w-md text-sm text-slate-400">
        Ask a question, paste an image for analysis, or pick a starting point below.
      </p>

      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPromptSelect(suggestion)}
            className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] p-3.5 text-left text-sm text-slate-300 transition-colors hover:border-white/15 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
          >
            <MessageCircle size={15} className="mt-0.5 shrink-0 text-slate-500" />
            {suggestion}
          </button>
        ))}
      </div>

      <p className="mt-8 flex items-center gap-1.5 text-xs text-slate-500">
        <ImagePlus size={13} />
        Vision-capable models also accept image attachments.
      </p>
    </div>
  );
}
