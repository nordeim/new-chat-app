// Periodic SSE comment-frame emitter for the chat stream.
//
// While the provider has not yet produced its first byte (and between any
// sparse deltas), the connection between the route and the browser would sit
// completely idle. Proxies such as Cloudflare and nginx terminate idle
// connections after roughly 100 s — before the route's own provider timeout
// (175 s / 590 s) can fire, which turns every slow or hung provider request
// into an opaque network failure for the user. Emitting an SSE comment frame
// (": keep-alive") every 15 s resets those proxy idle timers; comment frames
// are ignored by the SSEParser on both sides (only `data:` lines carry events),
// so the browser contract is unchanged.
//
// Pure and dependency-free (interval math only) so the node:test suite can
// exercise it directly, following the same convention as origin.ts and
// title.ts. The caller owns what a beat sends — the route enqueues a raw
// comment frame and guards against enqueuing into an aborted stream.
export function startKeepAlive(
  beat: () => void,
  intervalMs: number,
): () => void {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1 ||
    intervalMs > 600_000
  )
    throw new RangeError("Invalid keep-alive interval.");
  const timer = setInterval(beat, intervalMs);
  return () => clearInterval(timer);
}
