# Lifecycle hooks module

## Purpose

This module owns Ivaldi lifecycle hook configuration and execution. It is separate from Git hooks and from OpenCode plugin internals.

Hooks are user-level command hooks stored in OpenChamber settings. Project-local executable hooks are intentionally deferred until Ivaldi has a trust-on-open policy.

The supported events are:

- `UserPromptSubmit`: before Ivaldi forwards a user message to OpenCode. This is currently the only blocking event.
- `ChatStart`: when OpenCode emits `session.created` for a root chat.
- `BeforeToolCall`: when OpenCode emits `session.next.tool.called`.
- `AfterToolCall`: when OpenCode emits `session.next.tool.success`.
- `ToolCallFailed`: when OpenCode emits `session.next.tool.failed`.
- `PermissionRequest`: when OpenCode emits `permission.asked` or `permission.v2.asked`.
- `PermissionDenied`: when OpenCode emits a permission reply whose reply is `reject`.
- `BeforeAgentSpawn`: when the authoritative tool-call event starts OpenCode's `task` tool.
- `AfterAgentReturn`: when the correlated `task` tool call reaches success or failure.
- `TaskCreated`: when OpenCode starts an authoritative `task` tool call.
- `TaskCompleted`: when the correlated `task` tool call reaches success or failure. The payload includes the terminal status.
- `WorktreeCreate`: after an Ivaldi-owned worktree creation succeeds.
- `WorktreeRemove`: after an Ivaldi-owned worktree removal succeeds.
- `BeforeCompact`: when OpenCode emits `session.next.compaction.started`.
- `ChatEnd`: when OpenCode emits `session.deleted` for a root chat.
- `Notification`: when Ivaldi broadcasts a user notification.

Every event except `UserPromptSubmit` is observational. Its hook runs after the owning runtime reports a successful state transition, so its failure mode is always `warn`. Configuration that requests `block` for a passive event is rejected instead of suggesting that Ivaldi can undo work that already happened.

`ExternalEventReceived` remains intentionally unsupported. Ivaldi does not yet have one authoritative external-event ingress contract. That event waits for the generic webhook and integration ingress planned in the event-automation milestone. Relay frames, rendered chat content, and unrelated transport traffic are not substitutes for that owner.

## Configuration

`settings.json` may contain `lifecycleHooks`, an ordered array of:

```json
{
  "id": "check-prompt",
  "event": "UserPromptSubmit",
  "command": ["node", "C:/Users/me/hooks/check-prompt.mjs"],
  "enabled": true,
  "timeoutMs": 10000,
  "failureMode": "warn"
}
```

Commands are argv arrays and execute with `shell: false`. The runtime gives hooks a minimal process environment rather than forwarding provider credentials and other arbitrary server secrets.

The hook receives one JSON event object on stdin. `UserPromptSubmit` uses this shape:

```json
{
  "event": "UserPromptSubmit",
  "sessionId": "ses_...",
  "directory": "C:/work/project",
  "message": {}
}
```

`message` is the parsed OpenCode message request body. Request headers and credentials are not included. The hook also receives:

- `IVALDI_HOOK_EVENT`
- `IVALDI_HOOK_ID`
- `IVALDI_SESSION_ID` when available

`warn` failures are logged and the prompt continues. `block` failures stop prompt submission.

Other events use the same common `event`, `sessionId`, and `directory` fields plus one event-specific field:

- `ChatStart`: `session`, the OpenCode session information from `session.created`.
- tool-call events: `tool`, containing the call ID, tool name when known, provider execution metadata, and event-specific result or error data.
- `PermissionRequest`: `request`, the permission request properties from the matching OpenCode event generation.
- `PermissionDenied`: `request`, containing the rejected request ID and reply.
- agent lifecycle events: `agent`, correlated from the OpenCode `task` tool call.
- task lifecycle events: `task`, containing the authoritative `task` tool start or its correlated terminal result.
- worktree events: `worktree`, containing the successful Ivaldi worktree mutation result or removal target.
- `BeforeCompact`: `compaction`, containing the compaction message ID, reason, and timestamp.
- `ChatEnd`: `session`, the deleted root-session information.
- `Notification`: `notification`, the Ivaldi notification payload before it is delivered to UI clients.

## Request boundary

`UserPromptSubmit` runs in the OpenChamber OpenCode proxy before the message request is forwarded upstream. The common request middleware parses only the matching `POST /api/session/:id/message` JSON body, then the proxy executes the configured hooks after the OpenCode readiness gate succeeds.

This makes the event authoritative for messages sent through Ivaldi and gives managed and external OpenCode servers the same behavior. It does not require a generated OpenCode plugin or a callback credential.

OpenCode-owned events subscribe to the shared global OpenCode event hub that already owns server-side event delivery. The adapter validates known OpenCode event shapes before converting them into lifecycle payloads. It accepts both current permission event generations and ignores malformed or unrelated events. Lifecycle hooks never infer tool, task, agent, or session lifecycle from rendered transcript history.

Tool start and terminal events expose the same call ID but terminal events do not repeat the tool name or input. The adapter therefore keeps a bounded, process-local correlation table keyed by session ID and call ID. `TaskCreated` and `BeforeAgentSpawn` fire directly from a `task` tool start. Generic `AfterToolCall` and `ToolCallFailed` events still fire if a terminal event arrives without a remembered start, with the tool name left unknown. `AfterAgentReturn` and `TaskCompleted` require the matching `task` start event in the same server process because that correlation is what proves the terminal tool call belongs to a subagent task. Child `session.created` events are not treated as tasks because `parentID` is not a task-only contract.

Ivaldi-owned worktree events come from the Git worktree mutation routes and the direct session-creation service that can provision a worktree. Removal emits only after a successful delete. Notification hooks observe the notification emitter once per valid `broadcastUiNotification` call, even when no UI client is connected.

Hook settings are loaded into the lifecycle runtime at server startup and refreshed whenever OpenChamber persists or reloads settings. Prompt submission only consults the validated in-memory hook list, so the zero-hook path performs no settings-file read. The global event stream also skips lifecycle event parsing entirely when no passive hook is enabled. Changes made through the lifecycle API or normal settings persistence take effect immediately without restarting OpenCode.

The runtime starts in an unavailable state until the initial settings read succeeds. If that read fails, prompt submission returns `LIFECYCLE_HOOK_CONFIG_UNAVAILABLE` instead of assuming there are no hooks. `GET /api/lifecycle-hooks` returns HTTP 503 while configuration is unavailable. A later successful settings load or write replaces the hook snapshot and restores normal operation.

## Management API

The UI manages hooks through OpenChamber-owned routes rather than editing `settings.json` directly:

- `GET /api/lifecycle-hooks` returns ordered hooks, supported values, and bounded recent execution results.
- `PUT /api/lifecycle-hooks` validates and replaces the ordered user-level hook list. This single ordered-list mutation supports create, edit, enable/disable, reorder, and delete operations.
- `POST /api/lifecycle-hooks/test` validates and executes one hook as a dry run without adding or enabling it.

API writes use strict validation and return `LIFECYCLE_HOOK_CONFIG_INVALID` with per-entry issues instead of silently dropping malformed entries. Persisted settings remain leniently sanitized on load so an old or partially corrupt entry cannot prevent server startup.

The managed `openchamber` agent tool uses the same lifecycle management service
for `lifecycle.list`, `lifecycle.create`, `lifecycle.update`,
`lifecycle.delete`, and `lifecycle.test`. Agent-created hooks default disabled;
activation must be explicit. Testing executes the saved command once without
persisting a configuration change. Both the HTTP routes and agent actions
validate the complete ordered list before a mutation is persisted, so Settings
and agent-driven changes cannot diverge in validation behavior.

## Failure and security behavior

- Hook stdout/stderr capture is bounded to 64 KiB each.
- Results report whether either output stream was truncated and include execution duration.
- Hook timeout is bounded by settings sanitization.
- Timeout cleanup sends termination first and escalates to a forced kill after a short grace period so a non-responsive hook cannot leave the request pending indefinitely.
- Hook commands never receive the complete OpenChamber process environment by default.
- Hook processes launch through the shared process boundary as subject `hook` in `full-access` mode. This is a normal host process launch with audit metadata, not an operating-system sandbox.
- A failed `warn` hook never blocks a prompt.
- A failed `block` hook returns HTTP 409 with code `LIFECYCLE_HOOK_BLOCKED` before the message reaches OpenCode.
- `block` is accepted only for lifecycle events that Ivaldi can stop before the underlying action occurs. It is currently limited to `UserPromptSubmit`.
- Passive lifecycle hook failures are recorded and logged without interrupting the shared OpenCode event stream.
- Hook infrastructure failure returns HTTP 500 with code `LIFECYCLE_HOOK_EVALUATION_FAILED` instead of silently bypassing configured policy.
- Hook configuration load failure returns HTTP 500 with code `LIFECYCLE_HOOK_CONFIG_UNAVAILABLE`; it never falls back to an empty active policy.
- Recent execution history is process-local and bounded; prompt contents are not copied into that history.
