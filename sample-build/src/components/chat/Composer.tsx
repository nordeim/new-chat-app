"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, ImagePlus, Loader2, Send, Settings2, Square, X } from "lucide-react";
import clsx from "clsx";
import { NVIDIA_MODELS, getModelConfig } from "@/lib/nvidia-models";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_UPLOAD_SIZE_BYTES,
  isAllowedImageType,
} from "@/lib/uploads-config";
import type { Attachment } from "@/lib/types";

interface AttachmentDraft {
  id: string;
  previewUrl: string;
  fileName: string;
  status: "uploading" | "done" | "error";
  attachment?: Attachment;
  errorMessage?: string;
}

interface ComposerProps {
  model: string;
  onModelChange: (model: string) => void;
  temperature: number;
  onTemperatureChange: (value: number) => void;
  reasoningEnabled: boolean;
  onReasoningEnabledChange: (value: boolean) => void;
  isStreaming: boolean;
  onSend: (input: { content: string; attachments: Attachment[] }) => void;
  onStop: () => void;
  initialText?: string;
}

const MAX_CONTENT_LENGTH = 8000;

export function Composer({
  model,
  onModelChange,
  temperature,
  onTemperatureChange,
  reasoningEnabled,
  onReasoningEnabledChange,
  isStreaming,
  onSend,
  onStop,
  initialText,
}: ComposerProps) {
  const [text, setText] = useState(initialText ?? "");
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const modelConfig = getModelConfig(model);

  useEffect(() => {
    if (initialText) {
      setText(initialText);
      textareaRef.current?.focus();
    }
  }, [initialText]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [text]);

  const uploadFile = useCallback(async (draftId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed.");
      setDrafts((prev) =>
        prev.map((draft) => (draft.id === draftId ? { ...draft, status: "done", attachment: data as Attachment } : draft)),
      );
    } catch (error) {
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === draftId
            ? { ...draft, status: "error", errorMessage: error instanceof Error ? error.message : "Upload failed." }
            : draft,
        ),
      );
    }
  }, []);

  const handleFilesSelected = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setLocalError(null);

      if (!modelConfig?.vision) {
        setLocalError(`${modelConfig?.label ?? model} does not support image attachments.`);
        return;
      }

      const remainingSlots = MAX_ATTACHMENTS_PER_MESSAGE - drafts.length;
      if (remainingSlots <= 0) {
        setLocalError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} images per message.`);
        return;
      }

      const selected = Array.from(files).slice(0, remainingSlots);
      for (const file of selected) {
        if (!isAllowedImageType(file.type)) {
          setLocalError(`Unsupported image type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`);
          continue;
        }
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
          setLocalError(`"${file.name}" exceeds the ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB limit.`);
          continue;
        }
        const draftId = crypto.randomUUID();
        setDrafts((prev) => [
          ...prev,
          { id: draftId, previewUrl: URL.createObjectURL(file), fileName: file.name, status: "uploading" },
        ]);
        void uploadFile(draftId, file);
      }
    },
    [drafts.length, model, modelConfig, uploadFile],
  );

  const removeDraft = (id: string) => {
    setDrafts((prev) => {
      const target = prev.find((draft) => draft.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((draft) => draft.id !== id);
    });
  };

  const handleModelChange = (nextModel: string) => {
    onModelChange(nextModel);
    setIsModelMenuOpen(false);
    const nextConfig = getModelConfig(nextModel);
    if (!nextConfig?.vision && drafts.length > 0) {
      drafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
      setDrafts([]);
      setLocalError(`Switched to ${nextConfig?.label ?? nextModel}, which doesn't support images. Attachments were removed.`);
    }
  };

  const isUploading = drafts.some((draft) => draft.status === "uploading");
  const readyAttachments = drafts.filter((draft) => draft.status === "done" && draft.attachment);
  const canSend = !isStreaming && !isUploading && (text.trim().length > 0 || readyAttachments.length > 0);

  const handleSend = () => {
    if (!canSend) return;
    const attachments = readyAttachments.map((draft) => draft.attachment!) ?? [];
    onSend({ content: text.trim(), attachments });
    setText("");
    drafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
    setDrafts([]);
    setLocalError(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/5 bg-slate-950/95 px-4 pb-4 pt-3 md:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModelMenuOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={isModelMenuOpen}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
            >
              {modelConfig?.label ?? model}
              <ChevronDown size={13} />
            </button>
            {isModelMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close model menu"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setIsModelMenuOpen(false)}
                />
                <ul
                  role="listbox"
                  className="absolute bottom-full z-20 mb-2 w-72 rounded-xl border border-white/10 bg-slate-900 p-1.5 shadow-xl"
                >
                  {NVIDIA_MODELS.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={option.id === model}
                        onClick={() => handleModelChange(option.id)}
                        className={clsx(
                          "flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm",
                          option.id === model ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5",
                        )}
                      >
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-slate-500">{option.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {modelConfig?.reasoningMode === "toggle" && (
            <button
              type="button"
              onClick={() => onReasoningEnabledChange(!reasoningEnabled)}
              aria-pressed={reasoningEnabled}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                reasoningEnabled
                  ? "border-[color:var(--color-accent)]/40 bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10",
              )}
            >
              Extended thinking {reasoningEnabled ? "on" : "off"}
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSettingsOpen((open) => !open)}
              aria-haspopup="dialog"
              aria-expanded={isSettingsOpen}
              aria-label="Generation settings"
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
            >
              <Settings2 size={13} />
              Temp {temperature.toFixed(1)}
            </button>
            {isSettingsOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close settings"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setIsSettingsOpen(false)}
                />
                <div className="absolute bottom-full z-20 mb-2 w-64 rounded-xl border border-white/10 bg-slate-900 p-4 shadow-xl">
                  <label htmlFor="temperature" className="flex items-center justify-between text-xs text-slate-400">
                    Temperature
                    <span className="font-mono text-slate-200">{temperature.toFixed(1)}</span>
                  </label>
                  <input
                    id="temperature"
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(event) => onTemperatureChange(Number(event.target.value))}
                    className="mt-2 w-full accent-[color:var(--color-accent)]"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-500">Lower is focused and deterministic; higher is more creative.</p>
                </div>
              </>
            )}
          </div>
        </div>

        {localError && (
          <div className="mb-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {localError}
          </div>
        )}

        {drafts.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.previewUrl} alt={draft.fileName} className="h-full w-full object-cover" />
                {draft.status === "uploading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 size={16} className="animate-spin text-white" />
                  </div>
                )}
                {draft.status === "error" && (
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-red-900/70"
                    title={draft.errorMessage}
                  >
                    <AlertCircle size={16} className="text-red-200" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeDraft(draft.id)}
                  aria-label={`Remove ${draft.fileName}`}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 focus-within:border-[color:var(--color-accent)]/60">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!modelConfig?.vision}
            aria-label="Attach image"
            className="mb-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ImagePlus size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(event) => {
              handleFilesSelected(event.target.files);
              event.target.value = "";
            }}
          />

          <label htmlFor="composer-textarea" className="sr-only">
            Message
          </label>
          <textarea
            id="composer-textarea"
            ref={textareaRef}
            rows={1}
            value={text}
            maxLength={MAX_CONTENT_LENGTH}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the assistant… (Shift+Enter for a new line)"
            className="max-h-60 flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="mb-1 flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
            >
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              className="mb-1 flex shrink-0 items-center gap-1.5 rounded-lg bg-[color:var(--color-accent)] px-3 py-2 text-sm font-medium text-slate-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-right text-[11px] text-slate-600">{text.length}/{MAX_CONTENT_LENGTH}</p>
      </div>
    </div>
  );
}
