import { z } from "zod";

export const imageSchema = z
  .string()
  .max(2_800_000)
  .regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    "Use a PNG, JPEG, or WebP image under 2 MB.",
  );
export const chatInputSchema = z
  .object({
    conversationId: z.uuid().optional(),
    content: z
      .string()
      .trim()
      .min(1, "Write a message first.")
      .max(16000, "Messages can contain up to 16,000 characters."),
    image: imageSchema.optional(),
    settings: z
      .object({
        temperature: z.number().min(0).max(2),
        maxTokens: z.number().int().min(256).max(16384),
        reasoningEffort: z.enum(["low", "high", "max"]),
      })
      .strict(),
  })
  .strict();

export const titleSchema = z
  .object({ title: z.string().trim().min(1).max(100) })
  .strict();
export const idSchema = z.uuid();

export const providerChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            reasoning_content: z.string().nullish(),
          })
          .optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  error: z.unknown().optional(),
});
