"use client";

import { useState } from "react";
import { Check, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import clsx from "clsx";
import type { Conversation } from "@/lib/types";

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  open,
  onClose,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const commitRename = (id: string) => {
    const trimmed = draftTitle.trim();
    if (trimmed.length > 0) onRename(id, trimmed);
    setEditingId(null);
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-white/5 bg-slate-950 transition-transform md:static md:z-0 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 px-3 pb-2 pt-4">
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
          >
            <MessageSquarePlus size={16} />
            New chat
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="rounded-lg p-2.5 text-slate-400 hover:bg-white/5 hover:text-slate-100 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="Conversations" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2">
          {conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-500">No conversations yet.</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              const isEditing = editingId === conversation.id;
              return (
                <li key={conversation.id}>
                  <div
                    className={clsx(
                      "group flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5",
                    )}
                  >
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRename(conversation.id);
                            if (event.key === "Escape") setEditingId(null);
                          }}
                          className="min-w-0 flex-1 rounded border border-white/20 bg-slate-900 px-1.5 py-1 text-sm text-white outline-none focus-visible:border-[color:var(--color-accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => commitRename(conversation.id)}
                          aria-label="Save title"
                          className="shrink-0 rounded p-1 text-slate-400 hover:text-white"
                        >
                          <Check size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelect(conversation.id)}
                          className="min-w-0 flex-1 truncate text-left"
                          title={conversation.title}
                        >
                          {conversation.title}
                        </button>
                        <span className="shrink-0 text-[11px] text-slate-500 group-hover:hidden">
                          {formatRelativeTime(conversation.updatedAt)}
                        </span>
                        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(conversation.id);
                              setDraftTitle(conversation.title);
                            }}
                            aria-label="Rename conversation"
                            className="rounded p-1 text-slate-400 hover:text-white"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(conversation.id)}
                            aria-label="Delete conversation"
                            className="rounded p-1 text-slate-400 hover:text-red-400"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/5 px-4 py-3 text-xs text-slate-500">
          Powered by NVIDIA-hosted models
        </div>
      </aside>
    </>
  );
}
