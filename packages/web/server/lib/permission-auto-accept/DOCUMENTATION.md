# Permission modes and risk-aware Auto

## Purpose

This module owns the authoritative per-session permission mode for web,
desktop, and mobile runtimes. Policy is persisted in OpenChamber settings so
permission handling survives UI disconnects and server restarts.

Supported modes:

- `manual`: leave every OpenCode permission request for the user;
- `auto`: automatically answer only requests classified as routine;
- `full-access`: automatically answer every OpenCode permission request.

Auto is an approval policy, not a sandbox. A command that Auto approves still
runs with the normal host authority of the Ivaldi/OpenCode process.

Modes only decide how Ivaldi answers the requests OpenCode raises. OpenCode
raises one only when a permission rule says `ask`, and its default agents allow
edits and shell commands. The permission guard below makes those raise a
request, so the mode decides them too.

## Permission guard

`opencode-guard.js` writes an OpenCode plugin under
`<dataDir>/permission-guard/` and adds it to `OPENCODE_CONFIG_CONTENT` every
time Ivaldi starts its managed OpenCode. The guard does not depend on the
mode. Before each prompt, its `chat.message` hook reads the agents and the
session and appends a guard block to the session's permission rules:

- a catch-all `ask` for `edit` and for `bash`;
- then every agent and session rule that applies to them, in order, with
  `allow` turned into `ask`.

OpenCode takes the last matching rule, and session rules come after agent
rules. So every edit and shell command now raises a request, while every
`deny` the agent or the session had still denies. Plan mode still cannot edit
outside its plan files, for example. The responder then answers by mode: Full
access approves, Auto runs the classifier, and Manual leaves it to the user.

The block is wrapped in two marker rules, `ivaldi.guard.start` and
`ivaldi.guard.end`. They are `deny` rules on names no tool uses, so they
change nothing on their own. A subagent inherits only its parent's `deny`
rules, so it inherits both markers and drops the parent's block before
building its own from its own agent.

The hook writes only when the newest block differs from the one it computes,
so a block is added once per agent change. It never throws, because a throw
would fail the prompt. When it cannot read the agents or the session, it
writes nothing and the prompt runs with the rules the session already has. A
block built without those rules could turn a `deny` into a prompt.

Limits:

- Only Ivaldi's managed OpenCode gets the plugin. An external OpenCode
  server and VS Code keep OpenCode's own rules, where Manual does not stop
  an edit the agent allows.
- A rule set to `allow` in the user's OpenCode config now asks too. The
  user can still answer "always".
- Only `edit` and `bash` are guarded. Reads, searches and web fetches
  follow the agent's rules as before.
- The guard applies from the first prompt after OpenCode starts with it. A
  run already in progress keeps its rules.
- Scheduled tasks that do not set `permissionAutoAccept` now wait for the
  user on edits and shell commands, as their mode says.

New sessions default to Full access in both Work and Developer product modes. Manual and Auto are a choice in the composer.

## Policy persistence and inheritance

`permissionAutoAccept.modes` is the authoritative mode map. The legacy
`permissionAutoAccept.sessions` boolean map remains a compatibility mirror:
`full-access` maps to `true`; Manual and Auto map to `false`.

Policy inheritance uses the nearest explicit session mode. A child Manual mode
therefore overrides an Auto or Full-access parent. Missing lineage and failed
policy loads fail closed to Manual.

## Auto classifier

`classifier.js` is the server classifier. The VS Code foreground runtime uses
the typed mirror in `packages/ui/src/lib/permissionAutoPolicy.ts`; a cross-runtime
parity test runs the same decision vectors against both implementations.

Auto allows routine operations such as ordinary project read/edit/search,
public web reads, read-only Git/index staging, and common test/lint/type-check/
build commands. It asks before:

- external-directory access, including parent paths and absolute paths outside
  the known project directory;
- credential and secret paths such as `.env`, SSH/cloud credentials, and
  private-key files;
- privilege elevation;
- destructive shell commands;
- protected Git operations such as commit, push, checkout/switch, reset,
  rebase, merge, or destructive restore;
- dependency mutation and publishing;
- production/cloud mutations and mutating network commands;
- unknown permission types, project scripts, commands, or shell syntax.

The default for ambiguity is Ask. Auto never turns an unknown action into Full
access.

## Decisions and audit events

Each Auto classification returns an effect, stable reason code, and risk class.
Examples include `auto.allow.git-read`, `auto.ask.sensitive-path`, and
`auto.ask.protected-git`.

The server emits `openchamber:permission-auto-decision` for both Auto Allow and
Auto Ask decisions before replying. The event contains opaque session/request
IDs, permission type, mode, effect, reason code, and risk class. It deliberately
does not copy command text, file patterns, or secrets into the audit event.

VS Code emits the same safe decision payload as a foreground webview event.

## Runtime

`createPermissionAutoAcceptRuntime` loads and serializes policy writes,
subscribes to the global OpenCode event hub, caches session lineage, retries
transient replies, and reconciles pending permissions after startup, reconnect,
and mode changes. Selecting Auto immediately evaluates existing pending
requests: routine requests proceed; risky requests remain pending.

A failed pending-permission fetch is distinct from an empty successful response
and never clears policy state.

Notification suppression is request-specific. The notification runtime asks the
same permission evaluator whether the exact request will be auto-approved.
Risky Auto requests therefore keep the normal approval notification path.

## Routes

- `GET /api/permission-policy`
- `PUT /api/permission-policy/sessions/:sessionId`
- legacy `GET /api/permission-auto-accept`
- legacy `PUT /api/permission-auto-accept/sessions/:sessionId`

These are normal authenticated OpenChamber runtime routes. They must not be
added to browser URL-token allowlists.

## Runtime ownership

Web, desktop, and mobile use the server as the sole permission responder. The
UI projects the authoritative policy and renders risky pending requests until
OpenCode emits `permission.replied`. It skips the card and toast for a request
the server will approve, using the same classifier. If no reply arrives within
four seconds, it shows the request anyway, so a stopped responder never leaves
a session waiting on a hidden prompt. See
`packages/ui/src/sync/permission-server-answer.ts`.

VS Code does not run this server runtime. Its extension host persists and
broadcasts the same mode contract, while the foreground webview performs the
same classifier decision and permission reply. With every OpenChamber webview
closed or suspended, VS Code cannot auto-reply; this remains an intentional
runtime limitation.
