import type { ConversationSummary } from "@/lib/types";

export type HistoryPeriod = "Today" | "Yesterday" | "Previous 7 days" | "Older";

export interface HistoryGroup {
  label: HistoryPeriod;
  items: ConversationSummary[];
}

function startOfDay(value: Date) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function groupConversationsByPeriod(
  items: ConversationSummary[],
  now: Date = new Date(),
): HistoryGroup[] {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);

  const buckets: Record<HistoryPeriod, ConversationSummary[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const item of items) {
    const updated = new Date(item.updatedAt);
    if (Number.isNaN(updated.getTime()) || updated >= today)
      buckets.Today.push(item);
    else if (updated >= yesterday) buckets.Yesterday.push(item);
    else if (updated >= week) buckets["Previous 7 days"].push(item);
    else buckets.Older.push(item);
  }

  return (Object.keys(buckets) as HistoryPeriod[])
    .map((label) => ({ label, items: buckets[label] }))
    .filter((group) => group.items.length > 0);
}

export function formatRelativeTime(iso: string, now = Date.now()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = now - date.getTime();
  if (diffMs < 60_000) return "Just now";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
