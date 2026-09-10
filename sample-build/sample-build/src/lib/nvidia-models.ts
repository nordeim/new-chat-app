/**
 * Curated catalog of NVIDIA-hosted (build.nvidia.com / integrate.api.nvidia.com)
 * chat completion models exposed to the UI. This file has no secrets and is
 * safe to import from both server and client code.
 */
export type ReasoningMode = "none" | "toggle" | "always";

export interface NvidiaModelConfig {
  id: string;
  label: string;
  description: string;
  vision: boolean;
  reasoningMode: ReasoningMode;
}

export const NVIDIA_MODELS: NvidiaModelConfig[] = [
  {
    id: "moonshotai/kimi-k3",
    label: "Kimi K3",
    description: "Multimodal vision + reasoning model. Supports images and an optional thinking mode.",
    vision: true,
    reasoningMode: "toggle",
  },
  {
    id: "meta/llama-3.2-90b-vision-instruct",
    label: "Llama 3.2 90B Vision",
    description: "General-purpose vision-language model for image understanding, no reasoning trace.",
    vision: true,
    reasoningMode: "none",
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    label: "Nemotron 3 Nano Omni (Reasoning)",
    description: "Text-only reasoning model that thinks step by step before answering.",
    vision: false,
    reasoningMode: "always",
  },
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra 253B",
    description: "Large general-purpose text instruct model tuned for complex instructions.",
    vision: false,
    reasoningMode: "none",
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    description: "Fast, lightweight open-weight text model for everyday questions.",
    vision: false,
    reasoningMode: "none",
  },
];

export const DEFAULT_MODEL_ID = NVIDIA_MODELS[0].id;

export function getModelConfig(modelId: string): NvidiaModelConfig | undefined {
  return NVIDIA_MODELS.find((model) => model.id === modelId);
}

export function isKnownModel(modelId: string): boolean {
  return NVIDIA_MODELS.some((model) => model.id === modelId);
}
