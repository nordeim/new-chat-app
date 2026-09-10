export const WORKSPACE_RELOAD_ERROR =
  "Could not load your workspace. Please reload.";
export const WORKSPACE_DATABASE_ERROR =
  "The workspace cannot reach its database. Check that PostgreSQL is running and DATABASE_URL is correct, then retry.";

export function workspaceLoadError(health: { ok?: unknown } | null) {
  if (health && health.ok === false) return WORKSPACE_DATABASE_ERROR;
  return WORKSPACE_RELOAD_ERROR;
}
