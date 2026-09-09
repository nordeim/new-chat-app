const MAX_TITLE_LENGTH = 60;

/** Pure helper (safe for client and server) that turns a first message into a short title. */
export function deriveTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return "New conversation";
  if (normalized.length <= MAX_TITLE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}
