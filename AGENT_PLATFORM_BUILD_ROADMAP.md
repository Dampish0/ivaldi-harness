# Ivaldi agent platform build roadmap

Date: 2026-09-02

This roadmap turns `COMPETITOR_FEATURE_GAP_ANALYSIS.md` into an implementation sequence. The comparison document remains the research source. This file answers a narrower question: what should Ivaldi build, in what order, and what counts as done?

## Product constraint

Keep one capable runtime for Work and Developer mode. Work changes presentation and defaults. It must not become a weaker agent.

Provider neutrality and self-hosting are product requirements. New agent infrastructure must not assume one model vendor or one hosted control plane.

## Sequencing rule

Build foundations before UI polish for features that can execute code, access credentials, or run unattended. A feature is not complete when it only has a button. The runtime contract, failure behavior, persistence, tests, and supervision path must exist first.

## Milestone 0: lifecycle hooks

Goal: give users and organizations a supported way to run validation, logging, policy, and automation around agent activity.

Why first: hooks unlock formatting, secret scanning, audit logging, custom policy, memory capture, CI glue, and plugin workflows. They are useful before the full sandbox exists and can be built incrementally.

### Slice 0.1: user-level command hooks

Implement one event end to end:

- `UserPromptSubmit`
- user-level configuration only
- command represented as argv, never an interpolated shell string
- JSON event payload on stdin
- bounded timeout
- bounded stdout/stderr capture
- `warn` and `block` failure modes
- proxy preflight before the OpenCode message request is forwarded
- identical behavior for managed and external OpenCode servers
- malformed hook entries rejected by settings sanitization

Completion criteria:

- a configured hook runs once for each submitted user message;
- a successful hook allows the prompt through;
- a failing `warn` hook records the failure and allows the prompt through;
- a failing `block` hook prevents the prompt from continuing and returns a useful error;
- hooks receive the event payload on stdin and identifiers through safe environment variables;
- hook commands never run through a shell by default;
- zero configured hooks add no command execution overhead beyond the settings check;
- focused tests cover success, nonzero exit, timeout, malformed settings, proxy forwarding, and blocking.

Implementation status on 2026-09-02: backend vertical slice in progress on `work-dev-mode-polish`. The settings contract, proxy preflight, argv command runner, minimal environment, timeout handling, and focused tests have been added. UI management is intentionally left for Slice 0.2.

### Slice 0.2: hook management

- Developer Settings page for create/edit/enable/disable/reorder.
- Work keeps common automation hooks accessible but hides implementation-heavy event details behind an advanced editor.
- dry-run action with captured stdout/stderr.
- recent execution history with duration and result.
- explicit Apply action when managed OpenCode needs a restart.

### Slice 0.3: lifecycle expansion

Add events only when their owner is authoritative:

- `ChatStart`
- `BeforeToolCall`
- `AfterToolCall`
- `ToolCallFailed`
- `PermissionRequest`
- `PermissionDenied`
- `BeforeAgentSpawn`
- `AfterAgentReturn`
- `TaskCreated`
- `TaskCompleted`
- `WorktreeCreate`
- `WorktreeRemove`
- `BeforeCompact`
- `ChatEnd`
- `Notification`
- `ExternalEventReceived`

Do not synthesize tool lifecycle events from rendered transcript history.

### Slice 0.4: organization policy

- managed hooks that users cannot disable;
- allowlisted executables or signed hook packages;
- organization, workspace, project, and user precedence;
- secrets delivered through a credential broker rather than plaintext settings;
- audit entries for every blocking decision.

Project-local executable hooks wait for the trust-on-open milestone.

## Milestone 1: automatic checkpoints and rewind

Goal: every agent mutation batch has a recoverable file checkpoint independent of Git.

Reuse:

- existing conversation fork/revert UI;
- existing change tracking;
- file-write/tool activity events;
- existing project/session ownership.

Build:

1. checkpoint store with session, turn, file path, before hash, after hash, and content reference;
2. capture before the first agent write in a mutation batch;
3. preview affected files;
4. rewind files, chat, or both;
5. protect user edits made after the checkpoint;
6. retention and size limits;
7. Work mode uses this mostly as an invisible safety net; Developer gets the full timeline.

Completion criteria:

- dirty non-Git folders are supported;
- a rewind never silently overwrites a newer user edit;
- restart recovery preserves checkpoints;
- binary/large-file behavior is explicit;
- every restore has a preview and audit record.

## Milestone 2: process execution ownership

Direction update: 2026-09-03

Goal: keep Ivaldi-owned process launches consistent and observable without making the product depend on an operating-system sandbox.

The previous hard-sandbox plan is retired. Ivaldi must run on ordinary supported PCs without experimental Windows features or platform-specific containment setup.

Build and preserve:

- one direct process launcher for Ivaldi-owned child processes such as lifecycle hooks;
- explicit execution subjects and correlation IDs for audit and debugging;
- project/session context and stable policy hashes where they help routing or audit;
- Manual and Full access permission modes across supported runtimes;
- Auto as a separate future risk-aware approval feature, not as a sandbox alias;
- normal OpenCode behavior for shell commands, MCP, LSP, formatters, plugins, and custom tools;
- accurate status wording that never claims filesystem or network containment when none exists.

Do not add a native Windows sandbox helper, experimental process-sandbox API dependency, managed shell proxy, sandbox permission mode, or platform capability gate unless the user explicitly reopens that product direction.

Compatibility:

- stale persisted `sandbox` mode values must fall back safely to Manual;
- older boolean auto-accept state continues to map to Manual or Full access;
- Work mode keeps Full access as its default and Developer mode keeps Manual as its default unless product direction changes.

Completion criteria:

- the application has no hard-sandbox runtime or packaging dependency;
- no supported permission mode depends on an OS containment backend;
- Ivaldi-owned child processes still use the centralized direct launcher;
- OpenCode project features are not disabled merely to satisfy a containment claim;
- Auto is available as a risk-aware approval mode without changing host process authority;
- Windows, macOS, and Linux follow the same permission-mode contract without requiring special OS security features.

## Milestone 3: risk-aware Auto mode

Depends on the permission-policy and audit plumbing, not on an operating-system sandbox.

Current product modes:

- Manual
- Auto
- Full access

Baseline implemented: the deterministic policy layer automatically approves routine project work and asks on sensitive paths, external-directory access, privilege elevation, destructive commands, protected Git operations, dependency/publishing mutations, production/cloud mutations, mutating network calls, and unknown actions. Web/Desktop/Mobile and VS Code share the same decision contract, and Auto decisions carry stable reason codes plus safe audit events. Unknown actions fail closed to Ask.

A reviewer model remains optional future work for ambiguous cases. It may receive user intent and the proposed action, not hidden model reasoning. It must never silently widen Auto into Full access.

Completion criteria:

- routine work can proceed without prompts;
- credential access, privilege elevation, destructive operations, protected Git operations, and production mutations still stop according to policy;
- every automatic decision has a reason code and audit event.

## Milestone 4: external-content trust pipeline

Goal: every external result enters agent context with provenance and injection screening.

Sources:

- browser pages;
- MCP;
- plugins/apps;
- email/chat integrations;
- fetched files;
- command output where provenance is external;
- CI and webhook events.

Build one common ingress contract. Do not implement separate security classifiers in each tool.

Completion criteria:

- suspicious content is labeled rather than silently deleted;
- dangerous follow-up actions can require stronger approval when influenced by suspicious content;
- provenance survives compaction and delegation.

## Milestone 5: peer-session coordination

Goal: turn existing sessions and subagents into a coordination system.

Reuse:

- current session creation and messaging;
- mobile supervision;
- notifications and questions;
- remote instances;
- worktrees;
- subagents;
- Multi-run remains separate.

Build:

1. peer discovery with status/capabilities;
2. request/response correlation IDs;
3. `send`, `request`, `wait`, `subscribe completion`, and `cancel`;
4. completion callbacks;
5. fleet view with Working, Needs input, Ready for review, Done;
6. agent-to-agent provenance;
7. remote-host peers;
8. user takeover.

## Milestone 6: agent teams and reusable workflows

Agent Teams build on peer-session coordination.

Add:

- team lead;
- shared task board;
- task claiming and dependencies;
- shared artifact registry;
- worktree ownership and conflict detection;
- team budgets and completion criteria.

Then add rerunnable workflows:

- bounded fan-out/fan-in;
- loops and conditions;
- typed intermediate results;
- retries/timeouts;
- resumable checkpoints;
- per-step model/tool policy;
- save a successful ad-hoc workflow as a reusable asset.

## Milestone 7: Ivaldi Agent Server

Goal: one supported protocol for Desktop, Mobile, VS Code, automation, workers, and third-party clients.

Contract:

- create/resume/fork/interrupt chat;
- start/cancel turn;
- typed streamed events;
- approval and question requests;
- file/tool/process activity;
- project/runtime/model selection;
- auth and capability negotiation;
- reconnect/resume;
- idempotent request IDs;
- versioned schema.

Persistence:

- `SessionStore` interface;
- local implementation;
- PostgreSQL, Redis, and S3-compatible adapters for clustered deployments;
- optimistic version/lease checks;
- retention/encryption hooks;
- cross-host resume tests.

Generate Node and Python SDKs from the same schema.

## Milestone 8: event automation and workers

Build:

1. generic trigger contract;
2. webhook endpoint;
3. live inbound channels for already-running chats;
4. Gmail, Teams, Slack, GitHub, GitLab, Linear, and file-event adapters through plugins/apps;
5. review Inbox;
6. worker queue;
7. leases, heartbeats, draining and requeue;
8. disposable self-hosted workers;
9. workload identity with OIDC and optional SPIFFE;
10. durable result delivery and retry/idempotency.

## Milestone 9: extension distribution

Turn Plugins into the installable package boundary.

A plugin may bundle:

- skills;
- MCP/apps;
- agents;
- hooks;
- commands;
- optional LSP/tooling integration;
- configuration schema;
- permission manifest;
- setup/auth instructions.

Add versions, publisher identity, private organization catalogs, managed scopes, approval, rollout, rollback, and revocation.

## Milestone 10: Work automation differentiation

After the safety and automation foundations exist:

- WebMCP discovery in the authenticated browser;
- Appshots;
- Record & Replay to Skill;
- DOCX/XLSX/PPTX/PDF native workspaces;
- annotations across artifacts;
- shareable internal Sites;
- Teams-first ambient Ivaldi agent;
- shared workspace assistants;
- migration/import from Claude Code, Codex, Cursor, and OpenCode;
- privacy-first Computer History.

## Milestone 11: enterprise control plane

Build one organization policy model for:

- Work/Developer access;
- model/provider allowlists;
- MCP allow/deny rules;
- plugin/skill installation and sharing;
- Computer Use;
- network access;
- Auto mode;
- hooks;
- automations;
- worker capabilities;
- shared assistants.

Add:

- audit/compliance event API;
- OTLP export;
- organization analytics;
- credential broker;
- mandatory process launcher/wrapper;
- model gateway with SSO, routing and spend budgets;
- service accounts and workload identity.

## Deferred until the foundations are ready

These are useful, but they should not steal time from safety, orchestration, or automation:

- more IDE integrations;
- personality presets;
- simulator-specific polish;
- profile/activity vanity features;
- vendor-specific billing clones.

## First five deliverables

If work has to stay extremely focused, ship these in order:

1. Lifecycle hooks.
2. Automatic checkpoints and rewind.
3. OS filesystem/network execution boundary.
4. Peer-session coordination and fleet view.
5. Event-triggered automation.

The Agent Server should start immediately after the coordination contract stabilizes so later workers, integrations, and third-party clients do not depend on private application APIs.
