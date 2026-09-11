// Title derivation for newly created conversations. The first prompt becomes
// the stored title, so it must render as one clean line in the sidebar, the
// breadcrumb, and the conversation button's aria-label.
//
// Contract (both caps enforced together):
//   - whitespace runs collapse to single ASCII spaces — \s+ in JS also covers
//     Unicode whitespace (NBSP, U+3000 ideographic space, U+2028/9), which is
//     deliberate: stored titles are single-line strings.
//   - the cut is at 70 code points (never splitting a surrogate pair — a lone
//     surrogate encodes as U+FFFD in PostgreSQL) AND at most 100 UTF-16 units,
//     so the rename path (titleSchema .max(100) counts UTF-16 units) always
//     accepts a derived title verbatim.
//   - the result is trimmed at both ends.
//
// Pure and dependency-free so the node:test suite can exercise it directly,
// following the same convention as origin.ts and history.ts.
const TITLE_CODE_POINTS = 70;
const TITLE_UTF16_UNITS = 100;

export function deriveTitle(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= TITLE_CODE_POINTS) return collapsed;
  // Operate on code points, not UTF-16 units, so emoji and other astral
  // characters at the boundary survive intact.
  const points = Array.from(collapsed);
  if (points.length <= TITLE_CODE_POINTS) return collapsed;
  let title = points.slice(0, TITLE_CODE_POINTS).join("");
  // Astral characters count as 2 UTF-16 units: 70 code points can reach 140
  // units, past the rename schema's 100-unit cap. Trim whole code points
  // (never a surrogate half) until both caps hold.
  while (title.length > TITLE_UTF16_UNITS) {
    const titlePoints = Array.from(title);
    titlePoints.pop();
    title = titlePoints.join("");
  }
  return title.trimEnd();
}
