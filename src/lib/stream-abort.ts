/**
 * Abort taxonomy for the streaming chat route.
 *
 * When the browser disconnects mid-stream (Stop button, refresh, tab close,
 * navigating to another conversation, network drop), Next.js 16 aborts
 * `request.signal` — and the response pipe — with a named `ResponseAborted`
 * error (next-request.js: `class ResponseAborted extends Error`). The route's
 * `AbortSignal.any([...])` propagates that reason to the upstream provider
 * fetch, so the pending body read rejects with it and the catch block sees
 * `error.name === "ResponseAborted"`.
 *
 * Two aliases exist for the same client disconnect: the pipe-cancel path can
 * win the race and surface a default `AbortError` instead, and the route's own
 * `AbortSignal.timeout` surfaces as `TimeoutError`. Classifying by error name
 * (rather than signal state) keeps the three apart from genuine failures and
 * also works in `errorResponse`, where no signal is in scope.
 *
 * These logs are operator-facing evidence, so the shapers below pin the exact
 * JSON shapes: aborts log at warn level with `outcome: "aborted"` and carry no
 * message content — only ids, kinds, and lengths.
 */

export type StreamAbortKind = "client-disconnect" | "timeout";

const CLIENT_DISCONNECT_NAMES = ["ResponseAborted", "AbortError"];

export function streamAbortKind(error: unknown): StreamAbortKind | null {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "timeout";
    if (CLIENT_DISCONNECT_NAMES.includes(error.name))
      return "client-disconnect";
    // Node's premature client-close signature on request body streams
    // (IncomingMessage 'error' when the socket dies mid-upload — verified:
    // name="Error", message="aborted", code="ECONNRESET"). Provider/database
    // connection resets word differently, so this stays specific.
    if (
      error.message === "aborted" &&
      (error as NodeJS.ErrnoException).code === "ECONNRESET"
    )
      return "client-disconnect";
  }
  return null;
}

export function streamAbortLog(input: {
  operation: string;
  conversationId: string;
  abortBy: StreamAbortKind;
  partialChars: number;
}): { level: "warn"; line: string } {
  return {
    level: "warn",
    line: JSON.stringify({
      operation: input.operation,
      conversationId: input.conversationId,
      outcome: "aborted",
      abortBy: input.abortBy,
      partialChars: input.partialChars,
    }),
  };
}

export function streamErrorLog(input: {
  operation: string;
  conversationId: string;
  errorType: string;
}): { level: "error"; line: string } {
  return {
    level: "error",
    line: JSON.stringify({
      operation: input.operation,
      conversationId: input.conversationId,
      errorType: input.errorType,
    }),
  };
}

export function abortErrorLog(input: {
  operation: string;
  requestId: string;
  abortBy: StreamAbortKind;
  errorType: string;
}): { level: "warn"; line: string } {
  return {
    level: "warn",
    line: JSON.stringify({
      operation: input.operation,
      requestId: input.requestId,
      outcome: "aborted",
      abortBy: input.abortBy,
      errorType: input.errorType,
    }),
  };
}
