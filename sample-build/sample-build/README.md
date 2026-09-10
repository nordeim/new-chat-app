# Nova — NVIDIA-powered Chat

A production-ready chat application built on Next.js (App Router), Drizzle ORM,
and PostgreSQL, talking to NVIDIA-hosted foundation models via the
OpenAI-compatible `https://integrate.api.nvidia.com/v1/chat/completions` API.

## Features

- Streaming chat responses (token-by-token) with a stop/cancel control.
- Multiple named conversations, persisted in Postgres, with rename/delete.
- Multimodal input: attach up to 5 images per message for vision-capable models.
- Reasoning trace ("thinking") display for models that support chain-of-thought,
  with a per-message collapsible panel and an on/off toggle for models where
  reasoning is optional (e.g. Kimi K2.5's `chat_template_kwargs.thinking`).
- Adjustable temperature per request.
- Markdown + syntax-highlighted code rendering with copy-to-clipboard.
- Server-side validation (zod), per-IP rate limiting, and bounded context windows.

## Configuration

Copy `.env.example` if you need to point at a different database or key:

- `DATABASE_URL` — Postgres connection string.
- `NVIDIA_API_KEY` — API key from https://build.nvidia.com (starts with `nvapi-`).
- `NVIDIA_API_BASE_URL` — defaults to `https://integrate.api.nvidia.com/v1`.
- `NVIDIA_MAX_OUTPUT_TOKENS` — response length cap (default `4096`).

## Model catalog

The curated model list lives in `src/lib/nvidia-models.ts`. Add or remove
entries there to change what appears in the model picker; no other code
changes are required as long as the model id is valid on NVIDIA's endpoint.

## Known limitations / scope

- Single-workspace app: there is no authentication or per-user data isolation.
  Anyone who can reach the deployment shares the same conversation list. Add
  an auth layer (e.g. NextAuth + a `userId` column) before exposing this
  beyond a trusted internal audience.
- The chat rate limiter is in-memory per process; it resets on restart and
  does not coordinate across multiple server instances. Replace with a
  shared store (e.g. Redis) for multi-instance deployments.
- Uploaded images are stored on local disk under `public/uploads`. In a
  horizontally-scaled or ephemeral-filesystem deployment, swap this for
  object storage (S3/GCS) referenced by URL.
- Image inputs are base64-encoded into the request to NVIDIA at send time so
  the API can read them even when this app isn't publicly reachable; very
  large images may be rejected upstream depending on the selected model.
