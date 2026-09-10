# Kimi workspace — current architecture

## Scope and provenance

This starter adapts nordeim/new-chat-app at dd276ce648476bdd1cbaa50ae933b3fbb1b7c776. The complete upstream AGENTS.md, CLAUDE.md, README.md and 897-line architecture document were reviewed before implementing improvements. The sample build was compared for SSE and Markdown behavior; its older parser and non-memoized renderer were not adopted. Current installed versions are defined by package-lock.json, not historical documentation.

## Boundaries

- **Browser:** one React workspace owns draft, current conversation, settings and streaming state. Radix implements dialogs, mobile focus containment and image preview. No credential reaches the client bundle.
- **App Router:** `/api/conversations` bootstraps the browser session and lists/searches up to 100 conversations. `/api/conversations/[id]` reads, renames and deletes with ownership checks. `/api/chat` validates and streams NVIDIA responses. `/api/health` probes PostgreSQL only.
- **Domain:** pure schemas, history grouping, bounded SSE parser, origin checks and abort classification are independently testable. Search/network schemas are validated at the client boundary as well.
- **Data:** Drizzle over node-postgres. `chat_sessions.id` is a SHA-256 digest of a random cookie. `conversations.owner` has a cascading foreign key; messages are JSONB. `(owner, updated_at)` indexes bounded history retrieval. Journaled SQL migration is included.
- **External provider:** server-only bearer authorization to NVIDIA's OpenAI-compatible chat-completions endpoint using `moonshotai/kimi-k3`, streamed text, reasoning effort and image content blocks.

## Request lifecycle

1. Browser loads history, receiving a random HttpOnly, SameSite=Strict cookie (Secure on HTTPS).
2. Writes pass same-origin checks using Host or a trusted ingress's forwarded host. Cross-site Fetch Metadata is rejected.
3. Chat validates body size, content, settings and image signature/size.
4. An atomic database lease permits one active generation per workspace, with spacing and expiry. All requested conversations are owner-scoped.
5. The user turn is persisted; an outstanding identical user turn can be retried without appending a duplicate to an existing conversation.
6. Provider SSE is incrementally parsed. Thinking is represented as status; reasoning remains server-side.
7. The completed answer is persisted before the final browser event. Partial answers are discarded on interruption; the user can retry explicitly. No automatic provider retries risk duplicate billing.
8. Lease release is conditional on the holder's lease value; expiry recovers from process failure. Deletes lock/check the session and refuse during generation.

## Enhancement decisions

### Query-bound search results
The former `serverResults` array outlived its query, so a failed second query displayed unrelated results. Results now carry `term`, `items` and failure status. Only current-query results are displayed; API errors and malformed payloads fall back to local title matches with explicit disclosure and retry. Cancellation prevents superseded responses from taking ownership of current search state.

### Safe navigation identity
Opening a conversation now clears `currentId` before loading. Previously, messages were cleared while the old ID remained; a failed navigation could send a fresh message into the wrong conversation. The opening sequence counter still prevents out-of-order loads from winning.

### Bounded final-event parsing
Provider events retain the 1M-character default. Browser events allow 8M characters because a valid final answer of up to 1.2M characters can expand sixfold under JSON escaping, with metadata/truncation-copy overhead. A constructor validates the selected bound; both line and accumulated-event limits use it. LF/CRLF/CR and fragmented network chunks remain supported. Regression tests cover the worst escaped answer and continued rejection beyond bounds.

### UI refinement without changing contracts
The original base stylesheet and component architecture remain intact. `workspace-polish.css` supplies a more legible mint/editorial layer, improved sidebar hierarchy, a line-art welcome emblem, a high-contrast primary action and responsive composer styling. The scrollable history region is keyboard-focusable even when empty. Existing dialogs, starters, upload controls and shortcuts remain functional.

### Environment and dependencies
Next.js was upgraded to 16.3.4 after the supplied starter's production audit identified a critical advisory. Nonbreaking transitive fixes were applied through npm. Production audit is clean; four moderate development-tooling findings remain under Drizzle/esbuild, with no safe automated upgrade offered. The optional upstream migration/seed wrappers were omitted because they used raw database queries and swallowed some errors; use `npx drizzle-kit migrate`. No demo messages are inserted.

## Data and privacy constraints

This is a cookie-isolated workspace, not SSO, durable ownership or account recovery. Cookie loss loses access. Prompts/images/reasoning are stored in PostgreSQL; prompts and context go to NVIDIA. Inline image deletion follows conversation deletion, but cannot revoke provider processing. Exports omit image data. Remote Markdown images are not fetched; raw model HTML is not executed.

History and response admission are bounded, not designed for unlimited archival scale. Search scans bounded owner-scoped JSONB history; very large workspaces require normalized message storage/indexed search and pagination. The generation lease serializes session writes but is not an ingress/global spend defense.

## Verification and operations

See README.md for executable commands and docs/VERIFICATION.md for observed results. The preview uses a platform-managed build/start/health cycle, not a background dev process. Local browser tests use disposable database fixtures and explicit provider transport fixtures; public-site tests use separate browser sessions.

Production rollout remains conditional on organizational identity/RBAC, ingress rate limiting and spend budgets, least-privilege encrypted data storage, backups/recovery exercises, retention policy, monitoring and secret rotation. Retention currently measures last generation rather than read activity; it must be reviewed before scheduling. A deployment-specific script-nonce CSP and manual assistive-technology/cross-browser validation remain open. Historical SSH and provider credential exposure is documented upstream, but operator rotation cannot be verified here. The live site was tested, not redeployed.
