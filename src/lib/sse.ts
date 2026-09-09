// An SSE event may span network reads, UTF-8 characters, and multiple data lines.
export class SSEParser {
  private buffer = "";
  private data: string[] = [];
  push(chunk: string): string[] {
    this.buffer += chunk;
    if (this.buffer.length > 1_000_000)
      throw new Error("Stream event exceeds the size limit.");
    const events: string[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      if (line === "") {
        if (this.data.length) events.push(this.data.join("\n"));
        this.data = [];
      } else if (line.startsWith("data:")) {
        this.data.push(line.slice(5).replace(/^ /, ""));
        if (this.data.reduce((sum, value) => sum + value.length, 0) > 1_000_000)
          throw new Error("Stream event exceeds the size limit.");
      }
    }
    return events;
  }
  finish(): string[] {
    return this.push("\n\n");
  }
}
