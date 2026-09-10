const MAX_EVENT_CHARACTERS = 1_000_000;

// SSE uses LF, CRLF, or CR. Frame limits must not depend on network chunk size.
//
// The bound is configurable because the two sides of the pipeline see frames
// of very different sizes: the server parses provider chunks (small), while
// the browser must accept this app's own final `done` event, which carries a
// complete answer (up to the server's 1.2M-character cap) as one JSON-escaped
// data line — escaping can expand each character severalfold, so the browser
// bound must exceed the raw answer cap.
export class SSEParser {
  private readonly maxEventCharacters: number;

  constructor(maxEventCharacters = MAX_EVENT_CHARACTERS) {
    if (
      !Number.isSafeInteger(maxEventCharacters) ||
      maxEventCharacters < 1 ||
      maxEventCharacters > 8_000_000
    )
      throw new RangeError("Invalid stream event limit.");
    this.maxEventCharacters = maxEventCharacters;
  }

  private fragments: string[] = [];
  private lineLength = 0;
  private data: string[] = [];
  private dataLength = 0;
  private skipLF = false;

  private append(fragment: string) {
    this.lineLength += fragment.length;
    if (this.lineLength > this.maxEventCharacters)
      throw new Error("Stream event exceeds the size limit.");
    if (fragment) this.fragments.push(fragment);
  }

  private consumeLine(events: string[]) {
    const line = this.fragments.join("");
    this.fragments = [];
    this.lineLength = 0;
    if (line === "") {
      if (this.data.length) events.push(this.data.join("\n"));
      this.data = [];
      this.dataLength = 0;
      return;
    }
    if (!line.startsWith("data:")) return;
    const value = line.slice(line[5] === " " ? 6 : 5);
    this.dataLength += value.length + (this.data.length ? 1 : 0);
    if (this.dataLength > this.maxEventCharacters)
      throw new Error("Stream event exceeds the size limit.");
    this.data.push(value);
  }

  push(chunk: string): string[] {
    const events: string[] = [];
    let start = 0;
    for (let index = 0; index < chunk.length; index++) {
      const character = chunk[index];
      if (this.skipLF) {
        this.skipLF = false;
        if (character === "\n") {
          start = index + 1;
          continue;
        }
      }
      if (character !== "\r" && character !== "\n") continue;
      this.append(chunk.slice(start, index));
      this.consumeLine(events);
      this.skipLF = character === "\r";
      start = index + 1;
    }
    this.append(chunk.slice(start));
    return events;
  }

  finish(): string[] {
    return this.push("\n\n");
  }
}
