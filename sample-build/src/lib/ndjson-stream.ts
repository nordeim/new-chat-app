/**
 * Reads a fetch Response body as newline-delimited JSON, yielding one
 * parsed value per complete line. Tolerant of chunk boundaries splitting a
 * line across multiple reads.
 */
export async function* readNdjsonStream<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length === 0) continue;
        try {
          yield JSON.parse(line) as T;
        } catch {
          // Ignore malformed lines rather than crashing the stream reader.
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing.length > 0) {
      try {
        yield JSON.parse(trailing) as T;
      } catch {
        // Ignore trailing malformed content.
      }
    }
  } finally {
    reader.releaseLock();
  }
}
