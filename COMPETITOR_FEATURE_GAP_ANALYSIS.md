# Ivaldi feature-gap analysis: Claude Code and Codex

Date: 2026-09-02

This document compares the current Ivaldi/OpenChamber codebase with the current Claude Code and OpenAI Codex product direction. It focuses on product and harness capability, not model quality.

The most important conclusion is that Ivaldi already has much more of the modern agent stack than a surface-level comparison suggests. The main gaps are not basic chat, MCP, subagents, worktrees, remote access, or browser tooling. The gaps are concentrated in safer autonomy, coordinated multi-session work, reusable orchestration, event-driven execution, stable embedding/API contracts, team distribution/governance, and polished non-developer workflows.

This was re-audited on 2026-09-02 against the latest Claude Code documentation and the current Codex/ChatGPT developer documentation index. The late-2026 products have moved noticeably beyond the older "coding agent in a terminal" comparison: Claude Code now has an agent fleet view, cross-session messaging, dynamic workflow scripts, live event channels, routines, self-hosted runners and session identity; Codex now exposes its app-server protocol, agent import/migration, Computer History, WebMCP site tools, Linear/GitLab workflow surfaces and workload identity federation.

## Status legend

- **Missing**: no comparable first-class Ivaldi capability found.
- **Partial**: Ivaldi has meaningful infrastructure, but the competitor feature is materially more complete or productized.
- **Present**: Ivaldi already covers the core capability. Do not rebuild it just for parity.

## Executive ranking

| Priority | Gap | Status | Why it matters |
| --- | --- | --- | --- |
| P0 | OS-level filesystem + network sandbox | Missing | Foundation for letting agents act with fewer prompts without giving them the whole machine. |
| P0 | Risk-aware automatic approvals | Missing | Claude Auto Mode and Codex auto-review reduce approval fatigue while still stopping dangerous actions. |
| P0 | User-configurable lifecycle hooks | Missing | Lets teams enforce formatting, tests, secret scanning, logging, memory capture, and policy around every agent run. |
| P0 | Automatic checkpoints / true rewind | Missing | Makes large autonomous edits safer and reduces dependence on Git for every exploratory change. |
| P0 | Coordinated agent teams | Partial | Ivaldi has subagents and Multi-run, but not a shared-task, communicating team of autonomous agents. |
| P0 | First-class background process/task lifecycle | Partial | Long-running servers/watchers should remain attached to the agent while it continues other work. |
| P1 | Agent fleet control + cross-session messaging | Partial | Ivaldi can show and control many user-facing sessions, but agents cannot naturally discover, message, wait on and coordinate peer sessions as a distributed work system. |
| P1 | Rerunnable dynamic agent workflows | Missing | Claude can move orchestration into a generated script and run dozens/hundreds of subagents without bloating the lead model's context. |
| P1 | Event-triggered automations | Missing | Time schedules are not enough for office workflows, CI, inbox, Slack, PR, and operational monitoring. |
| P1 | Live inbound event channels | Missing | A running agent should be able to receive CI, monitoring, chat or webhook events and remote permission replies without polling or starting a separate scheduled task. |
| P1 | Hosted/cloud task execution | Missing | Long work currently depends on an Ivaldi/OpenCode host remaining available. |
| P1 | Embeddable agent runtime protocol + SDK | Partial | Ivaldi has HTTP/headless control, but not a stable bidirectional client protocol covering sessions, streaming events, approvals, auth, durable cross-host session state and agent lifecycle. |
| P1 | Workload identity / short-lived machine auth | Missing | CI, Kubernetes and worker pools should authenticate without long-lived user or service secrets. |
| P1 | Plugin bundles and team distribution | Partial | Skills, Plugins and MCP exist separately, but not as one portable workflow package with workspace distribution. |
| P1 | Enterprise policy, governed MCP/process/model access and audit logs | Missing | Company deployment needs central RBAC, MCP admission, process enforcement, model/spend policy and accountable agent actions. |
| P1 | Page-native WebMCP/site tools | Missing | MCP exists, but Ivaldi does not auto-discover structured tools exposed by the live website the browser is already using. |
| P1 | Cross-platform/locked Computer Use | Partial | Windows Computer Use exists; Codex extends the concept across Mac/Windows and remote locked workflows. |
| P1 | General app-window context / Appshots | Partial | Computer Use can capture windows, but there is no frictionless user action to attach any app window plus extracted text as context. |
| P1 | Record & Replay to create skills | Missing | Converts demonstrated desktop workflows into reusable automation without hand-authoring a skill. |
| P1 | Productized automatic code review | Partial | Ivaldi has strong PR-review automation internally, but not the same polished repository-level review product. |
| P2 | Security research agent / validated vulnerability workflow | Missing | Codex Security goes beyond ordinary review by threat-modeling, reproducing and validating vulnerabilities. |
| P2 | Office artifact creation + in-place annotation | Partial | Work mode needs native document/spreadsheet/slide workflows, not only generic file tools. |
| P2 | Shareable interactive work products | Missing | Codex Sites turns agent output into persistent, shared interactive tools and dashboards. |
| P2 | Slack/Teams-native delegation | Missing | Lets an agent participate where teams already work instead of requiring everyone to open Ivaldi. |
| P2 | Agent migration/import from Claude Code/Cursor | Missing | Reduces switching cost by bringing instructions, skills, plugins, projects and recent work into Ivaldi. |
| P2 | Linear-native task delegation | Missing | Codex can be assigned an issue like a teammate and report progress/results back into the issue thread. |
| P2 | GitLab-native MR review/delegation | Missing | Ivaldi's first-class repository workflow is GitHub-centric while competitors now cover GitLab review triggers and automation. |
| P2 | Ambient Computer History / activity timeline | Missing | Recent app/site activity can become searchable context, memories and reusable workflows without the user manually attaching everything. |
| P2 | Workspace plugin sharing/admin marketplace | Partial | Catalogs exist, but organization-level distribution, policy and permission administration are weaker. |
| P2 | Usage/admin analytics | Partial | Ivaldi has Usage UI, but not organization adoption, agent activity, plugin usage and productivity telemetry. |
| P2 | Runbook/alert deep links with prompt context | Partial | Ivaldi has strong deep links, but not a safe external link that resolves a repo/project and pre-fills an inert investigation prompt. |
| P3 | Advisor-model primitive | Partial | Ivaldi can use subagents or Multi-run for second opinions, but has no first-class independent advisor the main agent can consult at hard decisions. |
| P3 | Browser developer instrumentation | Partial | Ivaldi browser is strong, but Codex exposes richer browser state such as console/network/read-only JS and asset extraction. |
| P3 | IDE coverage beyond VS Code | Missing | No first-class JetBrains/Xcode-level integration found. |

---

# 1. Safety and autonomy

## 1.1 OS-level filesystem and network sandbox

**Status: Missing**

Claude Code and Codex both now treat sandboxing as a core part of the agent harness. Claude Code uses OS-level filesystem and network isolation so commands can run freely inside a bounded workspace while writes outside allowed paths and network access are constrained. Codex similarly combines workspace sandboxing with network policies and approvals.

Ivaldi currently has permission handling and a strong server-side per-session auto-accept mechanism, but that is not the same security boundary. An approved command still runs with the host user's real process privileges.

What Ivaldi needs:

- Filesystem policy with explicit read/write roots.
- Network egress allow/deny lists.
- Separate localhost policy.
- Child-process inheritance so scripts cannot escape the boundary by spawning another executable.
- Per-project and organization policy.
- Clear UI showing the effective boundary.
- A safe default profile for Developer mode and a stricter profile for Work mode automation.
- Windows-native implementation as a first-class requirement, not a later port.

This is probably the single most important architectural gap.

## 1.2 Risk-aware automatic approval mode

**Status: Missing**

Ivaldi has persistent permission auto-accept, including subagent inheritance and server-side operation while the UI is closed. That is useful, but it is binary: the user effectively chooses whether the session automatically accepts permission prompts.

Claude Code Auto Mode and Codex auto-review add a risk decision layer. Routine actions proceed, risky actions are inspected using context and policy, and only meaningful exceptions escalate to a human.

Recommended Ivaldi design:

- `Manual`: existing approval behavior.
- `Safe Auto`: automatically approve in-sandbox low-risk actions.
- `Policy Auto`: evaluate boundary-crossing actions against deterministic rules plus a small reviewer model.
- `Full Auto`: retain only catastrophic hard stops.

The reviewer should see user intent and the proposed action, not unrestricted hidden model reasoning.

High-value classifications:

- destructive filesystem operations;
- writes outside project roots;
- credential access;
- arbitrary network destinations;
- Git history rewriting and protected-branch operations;
- production/cloud mutations;
- privilege elevation;
- persistence mechanisms;
- actions that affect other users;
- attempts to modify Ivaldi's own safety policy.

## 1.3 Prompt-injection screening on tool output

**Status: Missing**

Claude Auto Mode scans external tool results for prompt injection before those results enter the main agent context. Anthropic explicitly treats trusted tools returning untrusted content as an attack path.

Ivaldi has threat-pattern handling around memory/knowledge, but I found no equivalent general ingress filter covering browser pages, MCP output, command output, repository files, email, Slack-like integrations, and other external data before the agent consumes it.

Recommended architecture:

- One centralized trust-boundary pipeline for all external tool returns.
- Provenance labels on context items.
- Lightweight injection classifier/probe.
- Policy to mark suspicious content instead of silently deleting it.
- Extra checks before suspicious content can influence credential/network/destructive actions.

## 1.4 Automatic code checkpoints and rewind

**Status: Missing**

Claude Code automatically checkpoints Claude-authored code before changes and lets the user rewind code, conversation, or both.

Ivaldi has conversation branching, revert/fork behavior, Git workflows, and underlying tool/session history. That is not equivalent to a transparent, automatic edit checkpoint system.

Recommended capability:

- Snapshot agent-authored file state before every mutation batch.
- Associate each snapshot with the turn/tool call that produced it.
- `Rewind conversation`.
- `Rewind files`.
- `Rewind both`.
- Preview changed files before restoring.
- Never overwrite user edits made after the checkpoint without explicit review.
- Keep checkpoints independent from Git so dirty or non-repository projects still work.

This should be a first-class Developer feature and an invisible safety net in Work.

## 1.5 Trust-on-open boundary for project configuration

**Status: Partial**

Modern agent tools increasingly treat project-local configuration itself as untrusted until the user trusts the folder. This matters because hooks, MCP configuration, scripts and agent instructions can execute or influence behavior before the first prompt.

Ivaldi should explicitly audit when it reads or activates:

- project-local plugin configuration;
- MCP configuration;
- OpenCode configuration;
- executable hooks;
- custom skills/scripts;
- project instructions;
- dev-server/startup commands.

The desired contract is simple: inert parsing is allowed before trust; executable or privileged behavior waits until trust is established.

## 1.6 Organization-enforced process launcher / wrapper

**Status: Missing**

Claude Code can be deployed behind a corporate launcher that wraps the processes Claude Code starts, including its background service and agent-view sessions. The wrapper is configured centrally and gives the organization an enforcement point outside the model's prompt/tool logic.

That is a different control from shell permission rules. A runtime-level wrapper can enforce or inject:

- endpoint/security tooling;
- environment sanitization;
- process accounting;
- cgroup/job-object limits;
- executable allow/deny policy;
- network namespace/proxy setup;
- audit correlation IDs;
- per-session credentials;
- operating-system containment that the agent cannot remove by editing project config.

Ivaldi currently starts and manages several process classes directly, but I found no single organization-enforced wrapper applied to every agent/runtime child process.

Recommended design:

- one server/managed setting such as `processLauncher`/`processWrapper`;
- applied consistently to OpenCode, shell commands, dev servers, Computer Use helpers and future worker-session processes where feasible;
- immutable to ordinary project/user settings when organization-managed;
- explicit argument/environment contract;
- session/task/user identity passed as non-secret metadata;
- timeout/failure behavior that fails closed for managed deployments;
- Windows-first support through Job Objects/process creation policy as well as Unix wrapper scripts.

This is complementary to sandboxing: the sandbox defines what a process can reach; the wrapper gives the organization a guaranteed choke point for how that process starts.

---

# 2. Extensibility and orchestration

## 2.1 User-configurable lifecycle hooks

**Status: Missing**

Claude Code exposes a much broader hook surface than simple before/after tool callbacks: session setup/start/end, prompt submission/expansion, permission requests and denials, tool start/success/failure, subagent and teammate lifecycle, task creation/completion, compaction, worktree creation/removal, configuration/instruction/file changes, notifications and MCP elicitation. Hook handlers can be commands, HTTP endpoints, MCP tools, prompts or agents depending on the event. Codex also exposes lifecycle hooks for repository-specific validation, logging, policy and reusable automation.

Ivaldi has internal OpenCode plugin hooks and runs Git's `post-checkout` hook after worktree creation. I found no comparable user-facing lifecycle hook system.

Ivaldi should support at least:

- `ChatStart`
- `UserPromptSubmit`
- `BeforeToolCall`
- `AfterToolCall`
- `ToolCallFailed`
- `BeforeFileWrite`
- `AfterFileWrite`
- `BeforeCommand`
- `AfterCommand`
- `BeforeAgentSpawn`
- `AfterAgentReturn`
- `PermissionRequest`
- `PermissionDenied`
- `TaskCreated`
- `TaskCompleted`
- `WorktreeCreate`
- `WorktreeRemove`
- `ConfigChanged`
- `ExternalEventReceived`
- `BeforeCompact`
- `ChatEnd`
- `Notification`

Hooks should be scoped:

- user;
- workspace/team;
- project;
- optional directory subtree.

They also need explicit timeout, failure behavior, environment variables, secret handling, logs and a trust model.

## 2.2 Coordinated agent teams

**Status: Partial**

Ivaldi already has two important pieces:

- subagents, including nested subagents and direct prompting;
- Multi-run/fusion for parallel model runs and comparison.

What it lacks is the Claude Code agent-team model: several peer agents coordinate on a shared objective, split work, communicate, claim tasks, synchronize findings and let the user take over an individual teammate.

This is not the same as Multi-run. Multi-run fans a prompt out. Agent teams are a distributed work system.

Claude's newer orchestration stack makes that distinction even sharper. Agent view is a command center for many persistent background sessions; cross-session messaging lets Claude discover and message peer sessions, including reachable sessions on other machines or the web; and agent teams add a shared task list plus peer coordination inside a team. Ivaldi's UI can already display many sessions and its `openchamber` control tool can create/send/read user-facing sessions, but the tool intentionally tells the current agent not to use those sessions to delegate its own task, and dispatches have no automatic completion callback. That means the infrastructure is useful, but it is not yet an agent-native coordination fabric.

Needed primitives:

- Team definition with a lead/orchestrator.
- Shared task board with dependencies and ownership.
- Agent-to-agent messages.
- Shared artifact/result registry.
- Controlled shared context rather than copying every transcript everywhere.
- Per-agent working directory/worktree strategy.
- Conflict detection when agents touch overlapping files.
- Ability for user to inspect or take over one agent.
- Budget limits per team/member.
- Team-level completion criteria.
- Team summary that preserves provenance of which agent established which result.

This would be a major upgrade over the current Multi-run UX.

## 2.3 First-class background tasks/processes

**Status: Partial / needs productization**

Claude Code explicitly supports long-running background tasks so a dev server, watcher or build can stay alive while the main agent continues working.

Ivaldi has terminals, server-side processes, scheduled tasks and long-running infrastructure, so the low-level capability is nearby. I did not find an equally clear agent-owned background-task lifecycle.

Needed UX/API:

- Start command in background.
- Stable process ID owned by the chat/task.
- Stream/tail output without blocking the main agent.
- Health/status indicator.
- Send stdin.
- Restart/stop.
- Automatically attach relevant output back to the active task.
- Cleanup policy at chat/project/app shutdown.
- Persistent process option for dev servers.

## 2.4 Plugin bundles rather than separate extension concepts

**Status: Partial**

Ivaldi now gives MCP, Plugins and Skills first-class Work Settings pages, which is good. Codex's newer plugin model goes one step further: a single installable workflow package can bundle skills, connected apps and app templates/configuration.

Ivaldi should evolve Plugins into a distribution unit that can contain:

- one or more skills;
- MCP server declarations;
- connected-app definitions;
- setup/auth instructions;
- optional commands;
- optional agents;
- default settings/policies;
- icons/metadata;
- version and compatibility requirements.

The user should install "Salesforce account research" rather than separately understanding MCP + skill + provider + command configuration.

## 2.5 Plugin sharing, versioning and organization distribution

**Status: Partial**

Ivaldi has local plugin/skill management and a Skills Catalog. Missing compared with the current team-oriented competitors:

- organization-private plugin registry;
- `Shared with me` distribution;
- semantic versions/update channels;
- signed packages or publisher identity;
- admin approval;
- role/group rollout;
- dependency/permission manifest;
- update review;
- pin/rollback version;
- central disable/revoke.

For Work mode this is more important than exposing low-level plugin internals.

Claude Code's marketplace model is now worth treating as the target rather than only "a plugin folder": official and custom marketplaces can come from GitHub/GitLab/git/local/URL sources, installs have user/project/local/managed scopes, projects can suggest plugins to teammates, and bundles may contain skills, agents, hooks, MCP servers and LSP integrations. Ivaldi should keep its simpler Work UI while matching those distribution and governance primitives underneath.

## 2.6 Embeddable agent runtime protocol and SDK

**Status: Partial**

This is a larger gap than the older "public API" wording suggested.

Codex App Server is the protocol used to power rich Codex clients. It exposes a bidirectional agent lifecycle over a JSON-RPC-style protocol: create/resume/fork threads, begin and interrupt turns, stream item/tool/message events, handle approval requests, request user input, inspect skills/apps and manage authentication. Codex separately provides SDKs for programmatically controlling local agents. Anthropic likewise exposes an Agent SDK rather than requiring integrators to scrape a terminal UI.

Ivaldi already has valuable building blocks:

- a headless server;
- authenticated HTTP routes;
- the OpenChamber CLI;
- session create/send/fork/status/messages controls;
- streaming application state;
- approval/question infrastructure;
- remote runtime transport.

But those pieces are primarily the application's internal/control API. The repository explicitly describes some shared surfaces as source-level libraries rather than a standalone app-server product. There is no versioned, supported external protocol whose contract says "build any Ivaldi client on this" and covers the complete agent lifecycle.

Recommended product:

**Ivaldi Agent Server**

- bidirectional WebSocket or JSON-RPC transport;
- versioned protocol schema;
- session create/resume/fork/interrupt;
- turn lifecycle and streamed typed events;
- permission/question requests initiated by the server;
- file/tool/process activity events;
- model/agent/variant selection;
- project/runtime selection;
- stable authentication/session identity;
- pluggable durable session storage so another host can resume an embedded agent;
- capability negotiation;
- resumable subscriptions after reconnect;
- idempotent client request IDs;
- pluggable durable session storage so another host can resume the same agent session;
- a storage adapter contract for local disk, S3-compatible object storage, Redis and PostgreSQL-backed deployments;
- explicit separation between the live worker process and the durable session record;
- storage failure semantics that do not silently report a persisted session when only local state survived;
- Node and Python SDKs generated from the same schema;
- compatibility tests so Desktop, Mobile, VS Code and third-party clients exercise the same contract.

This would also simplify Ivaldi itself: first-party clients could increasingly become consumers of the same supported protocol instead of privileged one-off integrations.

Anthropic's Agent SDK now documents external session persistence as a first-class hosting concern. Its hosting guidance separates the running process from the session record and describes mirroring transcripts to shared storage such as S3, Redis or another backend so a different host can resume the conversation. Ivaldi's public agent protocol should make that behavior part of the contract rather than leave it as an implementation detail of one server process.

Anthropic's Agent SDK now explicitly supports mirroring session transcripts to external storage such as S3, Redis or another application backend so a different host can resume the same session. Ivaldi's Agent Server should include that portability in the contract rather than tying resumability to one host's local session database. A narrow persistence interface is enough: append/read transcript events, checkpoint metadata, optimistic versioning and retention hooks; storage adapters can then target PostgreSQL, Redis, S3-compatible object storage or a customer's own service.

## 2.7 Agent fleet view and cross-session messaging

**Status: Partial**

Claude Code's agent view treats long-running sessions as a fleet. It groups work into states such as working, needs input and completed, gives each session a concise live summary, lets the user peek/reply without opening the full transcript, and keeps background sessions alive under a supervisor. Cross-session messaging then lets Claude list and message peer sessions rather than making the human manually copy results between them.

Ivaldi already has an unusually good starting point:

- global session visibility;
- live busy/retry state;
- notifications/questions/permissions;
- session switching and mobile supervision;
- session summaries/status UI;
- API/CLI actions to create, send to and read another session.

The missing layer is to make those capabilities composable for agents as well as humans.

Needed primitives:

- explicit peer-session discovery with capability/state metadata;
- `send`, `request`, `wait`, `subscribe-completion` and `cancel` semantics;
- correlation IDs so a result can be tied back to the delegation that requested it;
- inbound-message policy and provenance;
- user-visible peer conversation history;
- ability to coordinate across local and remote Ivaldi hosts;
- a compact "Needs input / Working / Ready for review / Done" fleet view;
- concise generated row summaries so supervision does not require transcript opening;
- notification/callback when delegated work completes.

This should be built as a generic session fabric. Agent Teams can then use it rather than inventing a second transport.

## 2.8 Dynamic reusable workflows

**Status: Missing**

Claude Code's dynamic workflows are a different primitive again. Claude writes a script that orchestrates many subagents, and the runtime executes that script. Intermediate state can live in script variables instead of flooding the lead model's context, the orchestration itself is rerunnable, and the documented scale reaches dozens or hundreds of agents for audits, migrations and cross-checked research.

Ivaldi's Multi-run and subagents do not cover this:

- Multi-run is a user-selected fan-out/fusion interaction.
- Subagents are model-orchestrated workers inside a turn.
- Scheduled tasks rerun prompts at times, not an explicit orchestration graph/program.

An Ivaldi workflow runtime should support:

- agent-generated TypeScript/Python or a constrained workflow DSL;
- fan-out/fan-in;
- bounded concurrency;
- loops and conditionals;
- typed intermediate results;
- retries/timeouts;
- resumable checkpoints;
- per-step model/agent/tool policy;
- per-run budget;
- deterministic artifact/result collection;
- dry run and visualization;
- saving a successful ad-hoc orchestration as a reusable workflow/plugin asset.

For safety, the workflow runtime should orchestrate agents and approved tools rather than becoming an unrestricted hidden shell script executor.

## 2.9 Advisor-model primitive

**Status: Partial / lower priority**

Claude Code now has a first-class Advisor tool: the main model can consult an independently configured second model on difficult decisions, with organization model allowlists still applying. This differs from a user manually starting Multi-run because the primary agent can ask for a second opinion only where it judges the extra cost worthwhile.

Ivaldi could implement this cheaply on top of existing provider neutrality and subagent infrastructure:

- optional default advisor model per user/project/agent;
- `consult_advisor` tool with a narrow question/context payload;
- no write/tool capability for the advisor by default;
- returned recommendation clearly attributed to the advisor;
- policy for automatic use only above a cost/risk threshold;
- "always ask advisor before destructive/high-risk plan" organization rule.

This is not a P0 requirement, but provider neutrality could make Ivaldi's version stronger than either vendor by allowing, for example, a Qwen main model to consult Claude, GPT or another local model.

---

# 3. Automation and long-running work

## 3.1 Event-triggered tasks

**Status: Missing**

Ivaldi Scheduled Tasks are already real server-side automations. The missing piece is events.

Current ChatGPT Work can trigger tasks from events such as new Gmail mail, Slack messages and GitHub pull-request activity. Claude Code Routines similarly combine reusable cloud work with schedules, API calls and GitHub event triggers. This means "automation" now spans both clock schedules and external events in both major competitor ecosystems.

Ivaldi needs a generic trigger contract:

```text
Trigger -> optional condition -> context mapping -> task prompt -> approval policy -> destination
```

Examples:

- When a PR receives review comments, inspect them and prepare a fix plan.
- When an important customer email arrives, summarize it and update project context.
- When a Slack/Teams channel mentions a customer, add it to a running account brief.
- When CI fails, investigate the failing job.
- When a file appears in a watched folder, process it.
- When an MCP/app webhook fires, run a workflow.

This is one of the biggest Work-mode opportunities.

## 3.2 Cloud-hosted execution

**Status: Missing**

Ivaldi supports headless servers, remote instances, relay/tunnels and mobile access. Those are strong remote-host capabilities, but the task still needs an Ivaldi/OpenCode host that the user or organization operates.

Claude Code web and Codex cloud can execute a task in a vendor-managed isolated environment without the user's laptop remaining online. Claude's newer self-hosted environment model is especially relevant to Ivaldi: organizations can operate their own runner pool, runners claim queued sessions, clone the repository, stream events back, keep a lease/heartbeat, and requeue work when a runner disappears. That is much closer to Ivaldi's self-hosted philosophy than copying a vendor-only cloud.

An Ivaldi equivalent could be self-hostable rather than vendor-hosted:

- disposable worker VM/container;
- project checkout or mounted workspace;
- scoped credentials broker;
- configurable dependency/setup image;
- egress policy;
- artifact/result upload;
- task queue;
- resume/retry;
- budget/timeout limits.

This could fit Ivaldi's on-prem orientation especially well: "Ivaldi Worker Pool" rather than mandatory SaaS cloud.

The worker design should also have explicit session identity. Claude's self-hosted runners provide a verifiable session token so internal services can establish which user/session/runner is making a request instead of trusting a static shared credential. Ivaldi should design this at the same time as the worker pool, not bolt it on afterward.

## 3.3 Review queue / inbox for completed background work

**Status: Partial**

Codex Automations place completed runs into a review queue. Ivaldi has notifications, sessions and scheduled-task status, but there is no equally explicit inbox for delegated work that needs human review.

Add a unified **Inbox** containing:

- completed scheduled tasks;
- agent-team results;
- permissions/questions waiting for the user;
- automation failures;
- PR/code-review findings;
- proposed file changes;
- monitoring alerts.

This is more scalable than expecting users to remember which chat/task to reopen.

## 3.4 Programmatic scoped tokens and external automation contract

**Status: Partial**

Ivaldi already has a headless/API mode and runtime APIs. That is excellent infrastructure. Codex exposes a more deliberate external contract through its SDK and scoped programmatic access tokens for CI/internal automations.

Ivaldi should productize:

- service accounts;
- scoped tokens;
- expiry/rotation/revocation;
- project/action scopes;
- SDK for starting, steering and reading agent tasks;
- webhook/event stream;
- idempotency keys;
- audit trail;
- examples for CI, n8n, Power Automate and internal Node/Python services.

This external automation contract should share its schemas with the proposed Ivaldi Agent Server rather than creating another unrelated REST-only control plane.

## 3.5 Live event channels into a running session

**Status: Missing**

This is adjacent to event-triggered automation but not the same feature.

Claude Code Channels let an MCP server push messages, alerts and webhooks directly into a session that is already running. CI results, monitoring alerts or chat messages can arrive while Claude is working. A channel may also relay permission prompts back to a trusted remote user, allowing a long-running local session to pause, ask for authorization elsewhere, then continue.

Ivaldi currently has:

- SSE/realtime session events from its own runtime;
- notifications and push delivery;
- scheduled tasks;
- MCP tools;
- mobile/remote supervision.

What is missing is an **inbound external event bus addressed to an active agent session**.

Recommended primitive:

```text
external source -> authenticated channel -> normalized event -> session inbox -> agent turn/wakeup
```

Requirements:

- source identity and allowlists;
- schema/type for the event;
- user/project/session routing rules;
- deduplication/idempotency;
- rate limiting and backpressure;
- provenance in the transcript;
- configurable wake behavior: append only, wake agent, or require user confirmation;
- remote question/permission reply channel;
- policy preventing an untrusted event source from approving its own privileged action;
- durable delivery when the session is temporarily offline.

This would let Ivaldi support genuinely ambient operational agents without creating a new scheduled task for every event source.

## 3.6 Self-hosted worker pool and resumable agent execution

**Status: Missing as a productized scheduler; strong architectural fit**

Remote Ivaldi hosts are not the same thing as a worker pool. A worker pool is disposable capacity that can claim queued jobs, run several isolated sessions, retire, fail, and have unfinished work safely reassigned.

Recommended design:

- central queue/control plane;
- registered worker pools by organization/project/security class;
- capability labels such as OS, GPU, browser, Office apps, private-network access;
- ephemeral per-task workspace;
- owner/session affinity only when necessary;
- heartbeats and leases;
- safe requeue after worker loss;
- draining/retirement;
- artifact/checkpoint persistence outside the worker;
- task continuation on a fresh worker;
- per-session signed identity token;
- secrets broker issuing short-lived leases;
- admin limits for concurrency, cost and destinations.

This is one of the places Ivaldi can beat vendor products: the same control plane could route work to a laptop, office workstation, on-prem GPU server, Kubernetes pool or customer cloud while preserving one supervision model.

---

# 4. Computer, browser and visual context

## 4.1 Cross-platform Computer Use

**Status: Partial**

Ivaldi already has a real Windows Computer Use implementation with a native helper, per-session lease ownership and screenshot attachments. Do not rebuild this.

The remaining parity gaps are:

- macOS implementation;
- possibly Linux desktop implementation;
- remote continuation while the desktop is locked;
- richer organization policies for Computer Use;
- better Work-mode discovery as a capability rather than a developer tool.

## 4.2 Appshots / attach arbitrary application context

**Status: Partial**

Codex Appshots let the user attach a window to a thread with a hotkey, including both a screenshot and available text. This is different from asking the agent to take control of the application.

Ivaldi should add a low-friction context action:

**Attach current window**

Payload could contain:

- application/process name;
- window title;
- screenshot;
- accessibility-tree text;
- selected text if available;
- window bounds/display metadata;
- optional user annotation.

This would be valuable in both modes and especially strong for Work users sharing ERP, CRM, Excel, browser and line-of-business application context.

## 4.3 Record & Replay workflow authoring

**Status: Missing**

Codex can record a demonstrated Computer Use workflow and turn it into a reusable skill.

An Ivaldi version could be extremely compelling:

1. User clicks `Record workflow`.
2. User performs the workflow once.
3. Ivaldi records window/action/accessibility context.
4. Agent converts the trace into a parameterized skill.
5. User tests it in a safe dry run.
6. User names/shares the skill.

This is a better Work-mode skill authoring experience than asking office workers to write Markdown instructions manually.

## 4.4 Browser developer instrumentation

**Status: Partial**

Ivaldi's browser is already substantial: persistent desktop browser, page inspection/control, annotations and screenshots. Codex now exposes more browser internals during developer workflows.

Useful additions:

- console log stream;
- network request/response inspection;
- read-only JavaScript evaluation/context;
- DOM/accessibility snapshots as first-class attachments;
- failed request grouping;
- asset extraction;
- tab grouping/session management;
- performance trace capture;
- one-click "attach browser evidence" bundle.

Keep most of this Developer-only. Work should see Browser as a simple capability.

## 4.5 Page-native WebMCP / site tools

**Status: Missing**

Ivaldi supports MCP and has a strong signed-in browser, but those capabilities are currently separate. Codex/ChatGPT's WebMCP direction lets a website expose structured tools from the page the user is already visiting. The agent can discover those site tools in the live browser session without the user first installing and configuring a separate MCP server.

This matters because browser automation has two modes:

1. **Visual/DOM automation**: click buttons, type, inspect accessibility/DOM state.
2. **Page-native actions**: call a structured action the site intentionally exposes, using the same signed-in page context.

The second is often more reliable, faster and easier to secure.

An Ivaldi implementation should:

- discover WebMCP/site-tool registrations for the active page;
- bind tool availability to the tab/page that registered it;
- show the tool's origin/domain clearly;
- keep browser session/auth context without exposing cookies to the model;
- preserve normal MCP-style read/write annotations and approval metadata;
- invalidate tools when navigation/origin changes;
- let organization policy allow/deny domains or action classes;
- fall back to normal browser Computer Use when no site tools exist.

This could become a major Work differentiator because line-of-business web apps can expose reliable actions without needing a full custom Ivaldi plugin.

## 4.6 Safe external launch links for investigations

**Status: Partial**

Ivaldi already has a well-structured `openchamber://` deep-link system for sessions, new sessions, projects/directories, settings, changes and mobile notification navigation. That is a real strength.

Claude Code's newer deep-link workflow adds one useful missing shape: an external runbook, alert or dashboard can identify a repository and pre-fill an investigation prompt. The prompt is deliberately inert until the user reviews it and presses Enter, and the UI marks it as coming from an external link.

Ivaldi's `new-session` deep-link currently supports project/directory plus agent/model selection but not a pre-filled prompt with an external-origin trust warning.

Add:

- optional `q`/`prompt` field on new-session links;
- project/repository slug resolution rather than requiring an absolute path;
- visible `Prompt from external link` provenance;
- never auto-submit external prompt text;
- maximum prompt size;
- source/origin metadata when available;
- organization policy to disable or restrict prompt-bearing deep links;
- signed deep-link option for internal alerting/runbook systems.

Example use case: an internal Grafana alert links directly to Ivaldi with the correct service project selected and `Investigate the latency spike for checkout-api. Start by checking...` waiting in the composer.

---

# 5. Developer workflow gaps

## 5.1 Productized automatic PR review

**Status: Partial**

Ivaldi/OpenChamber already contains substantial PR-review machinery, including GitHub integration, review commands/agents, CI automation, checks/annotations and follow-up flows.

The gap is packaging it as a user-facing product capability comparable to Codex Code Review:

- enable review per repository from UI;
- auto-review when PR moves from draft to ready;
- `@ivaldi review` trigger;
- repo-specific review guidance;
- inline findings with confidence/severity;
- deduplicate resolved findings across commits;
- "Fix this finding" action;
- review status in Ivaldi PR UI;
- organization policy and analytics.

This is mostly productization, not building review intelligence from scratch.

The bar is also rising from "one AI reviewer" to review orchestration. Claude's Ultrareview direction uses deeper multi-agent verification for code review, while Codex exposes automatic repository review triggers and separate security review. Ivaldi's existing review agent can become the base, but a mature review service should be able to fan findings to independent verification agents before posting them so low-confidence noise never reaches the pull request.

## 5.2 Dedicated security research agent

**Status: Missing**

Codex Security is not simply `review for security`. It builds a codebase-specific threat model, searches repository history, attempts realistic exploit paths, validates findings in isolation, and proposes reviewed patches.

An Ivaldi Security mode could provide:

- editable threat model;
- trust boundaries / entry points / assets;
- continuous scan of new commits;
- autonomous repro/validation environment;
- evidence for exploitability;
- severity and attack preconditions;
- minimal remediation patch;
- regression test generation;
- PR workflow integration;
- suppressions with rationale and expiry.

This is a distinct product and should not be mixed into normal code review.

## 5.3 IDE coverage

**Status: Missing beyond VS Code**

Ivaldi has a VS Code extension. A mature developer product should eventually consider:

- JetBrains IDEs;
- Visual Studio;
- Xcode;
- possibly Neovim as a lightweight protocol client.

This is lower priority than harness/security work because Ivaldi Desktop already works across editors via the filesystem.

## 5.4 External editor/run configurations

**Status: Partial**

Codex is increasingly aware of the app or development target being built. Ivaldi has external editor actions and browser/runtime tooling, but could make project launch actions first-class:

- Run app.
- Run tests.
- Open simulator/emulator.
- Open project in configured IDE.
- Start dev environment.
- Preview current build.

These should be project-defined actions rather than hard-coded per framework.

Claude's desktop tooling now also exposes per-session iOS Simulator workflows. Ivaldi does not need to copy an iOS-specific feature wholesale, but its project action abstraction should be capable of attaching emulators/simulators/previews as first-class runtime targets with screenshots, logs and interaction rather than treating them as an arbitrary shell command.

## 5.5 Linear-native issue delegation

**Status: Missing as a first-class surface**

Codex can be assigned a Linear issue like another teammate or invoked with `@Codex` in an issue comment. It creates a cloud chat, posts progress and results back to the issue, and can continue toward a pull request in the selected environment. This is materially different from merely giving the local agent Linear MCP access.

Ivaldi should separate two concepts:

- **Linear as a tool**: search/read/update issues through MCP/plugin actions.
- **Linear as an agent surface**: assign an issue to Ivaldi and have the task lifecycle live in the issue thread.

First-class delegation needs:

- workspace installation and OAuth;
- mapping Linear teams/projects to Ivaldi projects/environments;
- assign-to-Ivaldi and `@Ivaldi` triggers;
- issue/comment context capture;
- one linked Ivaldi session per delegated task;
- progress/status comments with low noise;
- question/approval handoff back into the issue when safe;
- final result/diff/PR link;
- cancellation/retry;
- identity/audit trail;
- organization policy defining which projects and actions may be started from Linear.

The same abstraction should later support Jira and Azure DevOps rather than baking Linear into the agent runtime.

## 5.6 GitLab merge-request review and task integration

**Status: Missing as a first-class SCM integration**

Ivaldi's mature repository workflow is GitHub-centric. Codex now supports GitLab merge-request reviews, including `@codex review`, standard GitLab discussions, automatic reviews on MR open/every push, and an experimental smart trigger. GitLab Self-Managed/Dedicated can also be configured through enterprise administration.

For Ivaldi, GitLab should be implemented through a provider-neutral source-control abstraction rather than duplicating every GitHub component.

Needed capabilities:

- repository/account connection;
- issues and merge requests;
- comments/discussions;
- branch and pipeline status;
- review trigger webhooks;
- inline findings;
- draft/create/update MR;
- merge readiness;
- GitLab CI evidence;
- self-managed GitLab base URLs and certificates;
- service-account identity for unattended review;
- project-level review rules shared with the GitHub implementation.

If this abstraction is done well, Bitbucket/Azure DevOps become much cheaper afterward.

---

# 6. Work-mode and office-work gaps

## 6.1 Native artifact workspaces for documents, spreadsheets and slides

**Status: Partial**

Ivaldi can work with files and Skills can extend workflows, but current Codex/ChatGPT direction gives non-developers richer artifact-native experiences. Codex plugins/skills include document, spreadsheet and PDF workflows, while annotations are extending beyond code/web content to documents, spreadsheets and slides.

For Ivaldi Work mode, eventually add first-class viewers/editors for:

- DOCX/documents;
- spreadsheets;
- presentations;
- PDFs;
- Markdown/reports;
- CSV/data tables.

The key feature is not only generation. It is review and iterative editing in place.

## 6.2 Universal annotations

**Status: Partial**

Ivaldi already has browser annotations and inline comment infrastructure. Expand the same interaction model to:

- document paragraphs;
- spreadsheet cells/ranges/charts;
- slide objects/text boxes;
- PDF regions;
- images;
- generated reports;
- data visualizations.

The user should be able to point at the exact thing to change rather than describe it in prose.

## 6.3 Shareable interactive Sites

**Status: Missing**

Codex Sites turns generated work into a hosted interactive page/tool that other workspace members can use via URL.

An Ivaldi equivalent could be self-hosted and project-scoped:

- dashboard;
- report;
- planner;
- review board;
- lightweight internal app;
- data explorer.

The important product property is persistence and sharing, not static HTML generation.

## 6.4 Slack and Teams-native delegation / ambient channel agents

**Status: Missing as a first-class product surface**

Codex can be delegated work from Slack. Claude's newer Claude Tag direction goes further: a shared agent can live in a channel, use approved tools/codebases, remember relevant channel context, triage recurring work and continue longer tasks rather than behaving like a one-shot slash command.

Ivaldi should eventually support:

- `@Ivaldi` in Slack/Teams;
- thread context ingestion;
- project/environment resolution;
- task launch;
- progress/update replies;
- approval buttons;
- result summary with link back to the Ivaldi chat;
- persistent channel-scoped memory with transparent provenance;
- low-noise proactive triage rules;
- handoff of long-running work to a durable Ivaldi session;
- policy preventing the bot from reading unrelated channels.

An important trust rule: channel participants and the Ivaldi agent are not automatically equivalent principals. A person who can post in a channel should not implicitly gain the right to approve shell/network/credential actions unless organization policy explicitly grants that role.

For the office market, Microsoft Teams is probably more strategically important than Slack.

## 6.5 Shared workspace agents

**Status: Missing / partial through custom agents**

Ivaldi has agent definitions, but current enterprise products are moving toward shareable workspace agents that own workflows and have centrally governed tool/action permissions.

Needed layer:

- Agent template owned by organization/team.
- Versioned instructions and skills.
- Approved apps/MCP/tools.
- Per-action safeguards.
- Default model policy.
- Role/group access.
- Audit history.
- Usage analytics.
- Share/install flow.

This should sit above OpenCode's raw agent concept.

## 6.6 Ambient Computer History and activity recall

**Status: Missing**

OpenAI's Computer History feature turns opt-in recent activity across apps and websites into a searchable timeline and memory source. The product can answer questions such as what the user was working on, resume earlier context, recognize repeated workflows and turn those patterns into reusable skills/automations.

Ivaldi has memory, browser state, Computer Use and project/session history, but no ambient activity timeline across ordinary applications.

This is potentially powerful for Work mode, but it is also one of the highest-privacy-risk features in this entire document. It should only exist with an explicit local-first design:

- fully opt-in;
- clear recording indicator/pause control;
- per-application and per-domain allow/deny list;
- strong exclusions for password managers, private/incognito windows, banking/health apps and other sensitive surfaces;
- local processing/indexing by default;
- short configurable retention;
- inspect/delete/export controls;
- separate raw activity from distilled memories;
- never make raw history globally available to every project by default;
- provenance showing which activity produced a recalled fact;
- organization policy that can disable the feature entirely.

Useful Work experiences:

- `What was I doing before lunch?`
- `Find the spreadsheet I used when preparing last month's forecast.`
- `Continue the customer brief I was working on yesterday.`
- detect a repeated ERP/browser workflow and offer to save it as a skill.

This should come after sandboxing, permissions and enterprise policy because the privacy/security burden is substantial.

## 6.7 Import and migrate from other agents

**Status: Missing**

Codex now supports importing setup and recent work from other agent products such as Claude Code and Cursor, including combinations of instructions/settings, skills, plugins, projects and recent chats; some surfaces can keep imported configuration in sync.

This is not a core harness feature, but it is a high-leverage adoption feature. A user evaluating Ivaldi should not have to rebuild months of agent configuration before the product feels useful.

Recommended import wizard:

- detect Claude Code, Codex, Cursor and supported OpenCode configuration locations;
- show a preview before importing;
- import project/user instructions;
- map skills/commands/plugins/MCP servers where semantics match;
- import project list and optional recent sessions/history;
- preserve source attribution;
- flag unsupported settings instead of silently dropping them;
- never import secrets without an explicit credential flow;
- optional one-way sync for instructions/skills during a migration period;
- conflict handling when Ivaldi has already modified the destination item;
- "finish migration" action that detaches from the source.

Because Ivaldi is provider-neutral, a migration layer could become a competitive advantage rather than only a parity feature.

---

# 7. Enterprise administration gaps

## 7.1 RBAC for capabilities

**Status: Missing**

Ivaldi needs an organization policy layer if it is intended for broad company deployment.

Example controls:

- who can use Developer mode;
- who can add MCP servers;
- who can install/share plugins;
- which plugins are approved;
- which model providers are allowed;
- which projects a user can access;
- whether Computer Use is enabled;
- whether network access is allowed;
- whether scheduled/event-triggered automations are allowed;
- who may auto-accept actions;
- who may create/share workspace agents.

Do not scatter this across individual settings pages. It needs one policy model.

## 7.2 Audit / compliance event log

**Status: Missing**

Current enterprise agent products expose agent-native telemetry. Ivaldi should produce a durable event stream containing at least:

- user/task identity;
- project;
- model/provider;
- prompt submission metadata;
- tool/action type;
- permission decisions;
- policy overrides;
- file writes;
- shell commands;
- network destinations;
- MCP/app calls;
- Computer Use actions;
- agent/subagent/team spawn;
- plugin/skill versions;
- task completion/failure.

It should have:

- admin UI;
- export API;
- retention controls;
- SIEM-friendly JSON;
- correlation IDs;
- redaction rules.

## 7.3 Organization analytics

**Status: Partial**

Ivaldi has Usage surfaces and provider/quota information, but a company deployment needs adoption/operations analytics:

- active users;
- chats/tasks/turns;
- token/cost usage;
- model mix;
- plugin/skill/MCP usage;
- automation runs;
- approval rates;
- failed/blocked actions;
- task duration;
- accepted/reverted changes;
- code-review findings;
- Work vs Developer usage;
- Computer Use usage.

Avoid turning this into employee-surveillance scoring. It should answer operational and cost questions.

## 7.4 Managed plugin/app permissions

**Status: Partial**

An enterprise plugin system needs permissions at the action level, not only "installed or not".

Examples:

- SharePoint read but not write.
- Gmail read/search but not send/delete.
- GitHub issue read/write but no repository administration.
- Salesforce accounts read, opportunities update, no user administration.

The plugin should declare permissions; an admin grants a subset; the runtime enforces that subset.

## 7.5 Secure credential broker

**Status: Partial**

Ivaldi already handles provider secrets and remote/auth concerns, but autonomous cloud/event-driven work needs a stronger generic credential model:

- OS keychain locally;
- server secret store remotely;
- task-scoped credential leases;
- credentials never exposed directly to model text;
- OAuth refresh management;
- organization-managed service credentials;
- revocation;
- audit.

This becomes mandatory before cloud workers and shared workspace agents.

## 7.6 Workload identity federation for unattended agents

**Status: Missing**

Long-lived service tokens are no longer the strongest target for CI and worker authentication. Codex enterprise now supports workload identity federation: a trusted workload presents a short-lived OIDC token or SPIFFE JWT-SVID and receives a short-lived Codex access token mapped to a managed user/service account. Claude's self-hosted runner model similarly exposes verifiable per-session identity to services inside the customer's environment.

Ivaldi should support the same class of machine identity before worker pools become production-critical.

Recommended design:

- trust configuration for OIDC issuers;
- optional SPIFFE/SPIRE support for Kubernetes/on-prem environments;
- audience, issuer and claim constraints;
- claim-to-Ivaldi-service-account mapping;
- short-lived exchanged access token;
- project/action/tool scopes;
- no static secret required on the workload;
- automatic expiry and non-renewability beyond policy;
- audit records preserving originating workload + mapped principal + session/task;
- kill/revoke at issuer mapping or service-account level;
- compatibility with CI systems that already emit OIDC identities.

This should coexist with ordinary scoped tokens for simple integrations. Workload identity is for environments that can prove who they are without storing a secret.

## 7.7 Agent-native observability export

**Status: Partial**

Ivaldi already contains substantial internal performance tracing and session/event instrumentation. The enterprise gap is a supported export contract for operations teams rather than debug-only traces.

Claude Code supports managed monitoring/telemetry integrations and both major vendors increasingly expose agent activity through enterprise analytics/compliance surfaces. Ivaldi should make its event model exportable through standard tooling:

- OpenTelemetry traces/metrics where appropriate;
- structured audit events for security-relevant actions;
- task/session spans with parent-child relationships for subagents/teams/workflows;
- tool latency/failure counters;
- approval wait time;
- queue/worker utilization;
- model/token/cost dimensions;
- plugin/MCP/browser/Computer Use activity dimensions without prompt content by default;
- pluggable OTLP/HTTP sink;
- explicit content-redaction modes.

Do not turn model output or employee content into telemetry by default. Operational observability and content logging should be separate policies.

## 7.8 Centrally managed MCP policy

**Status: Missing**

Ivaldi already makes MCP easy to add and manage, including in Work mode. That is good for individual users. It is not enough for a company deployment where an administrator must be able to say which external tool servers are allowed to exist at all.

Claude Code now documents organization-managed MCP access with centrally distributed allowlists and denylists. Ivaldi needs the same enforcement in the runtime, not only a hidden or disabled Add button.

Recommended policy model:

- allow or deny MCP servers by canonical URL, package identity, executable path or signed publisher;
- optional allow-by-default or deny-by-default organization posture;
- managed entries that users cannot remove or modify;
- block user-added servers that conflict with organization policy;
- per-server tool allowlists when only part of an MCP server is approved;
- environment and credential policy per server;
- project/team scope in addition to organization-wide scope;
- a visible explanation when a server or tool is unavailable because of policy;
- audit events for additions, policy blocks, connection attempts and tool calls;
- the same policy enforcement for Desktop, Web, Mobile, VS Code and unattended workers.

This belongs under the organization policy engine. MCP configuration is a user feature. MCP admission is an administrative security boundary.

## 7.9 Organization-enforced process launcher

**Status: Missing**

Claude Code supports routing the processes it starts through a required corporate launcher, including background services and agent-view sessions. That gives an enterprise one enforcement point for endpoint security, monitoring, environment setup and process restrictions.

Ivaldi has extensive process and terminal capabilities but no equivalent organization-enforced wrapper in the repository today.

Recommended design:

- administrator-configured launcher executable plus fixed arguments;
- all agent-spawned shells, commands, background processes and worker child processes pass through it when policy requires it;
- users cannot bypass the wrapper by changing a local project setting;
- wrapper receives a minimal signed execution envelope containing user, session, project, action class and requested command metadata;
- wrapper can reject execution before the child process starts;
- stdout, stderr and exit status still flow through the ordinary Ivaldi process contract;
- clear behavior when the wrapper is unavailable or returns an invalid response;
- explicit escape hatch only for organization administrators and emergency recovery;
- audit log ties the requested command, wrapper decision and resulting process together.

This should complement sandboxing, not replace it. The sandbox controls what a process can reach. The launcher controls how company policy wraps or admits that process.

## 7.10 Enterprise model gateway and spend policy

**Status: Missing / Partial foundations**

Ivaldi already shows provider quota and cost information in several places. That is visibility. It does not provide a centrally enforced model gateway for a company.

Claude Code now documents a self-hosted Claude apps gateway with SSO, per-group model access, upstream/model routing, managed policies, telemetry and live per-developer spend limits. It also supports routing through other organization LLM gateways.

Ivaldi should make provider neutrality work at the organization layer too:

- optional organization gateway endpoint for all hosted-model traffic;
- OIDC/SSO identity at the gateway;
- group and role based provider/model allowlists;
- model aliases so a policy can route `fast`, `standard` or `high-reasoning` to approved concrete models;
- per-user, per-team and per-project spend limits;
- daily, weekly and monthly budget windows;
- live rejection when a hard limit is reached rather than passive quota display;
- soft-limit warnings before a hard stop;
- provider credential centralization so individual users do not need raw provider keys;
- routing policy for local, on-prem and hosted models;
- usage attribution by user, project, task and automation;
- OTLP and audit export from the gateway;
- admin API for policy, budget and routing changes;
- high-availability deployment guidance for organizations that make the gateway mandatory.

This is especially useful for Ivaldi because the product is multi-provider. A company should be able to allow local models for sensitive Work tasks, a hosted coding model for Developer mode, and a stronger advisor model only for approved users without configuring every desktop separately.

## 7.11 Durable external session storage for embedded agents

**Status: Missing as a supported contract**

Ivaldi persists ordinary application/session state, but the proposed embeddable Agent Server still needs a documented storage contract that works when agents move between hosts.

Anthropic's Agent SDK hosting guidance treats this as a production requirement. Session state can be mirrored to shared storage so another container or machine can resume the same session after restart, rescheduling or worker failure.

Ivaldi should support:

- a versioned `SessionStore` interface owned by the Agent Server;
- local filesystem implementation for single-machine installs;
- Redis, PostgreSQL and S3-compatible adapters for clustered deployments;
- optimistic version or lease checks that prevent two workers from advancing the same session accidentally;
- encryption at rest hooks and organization retention policy;
- durable mapping between public Ivaldi session IDs and provider/runtime session IDs;
- explicit mirror/write failure state surfaced to the caller;
- import/export for disaster recovery and migration;
- worker handoff tests proving that host A can stop and host B can resume without transcript loss.

Do not make Desktop depend on Redis or object storage. The local adapter should remain simple. The important part is that the external contract exists before worker pools and third-party SDK clients depend on process-local state.

---

# 8. Features Ivaldi already has and should not rebuild

These competitor features have a meaningful Ivaldi equivalent today.

## Subagents

**Status: Present**

Ivaldi/OpenChamber already supports subagent sessions, nested agents, task cards, direct subagent prompting when enabled, status tracking, notifications and permission inheritance.

The gap is coordinated peer teams, not subagents themselves.

## Worktrees and parallel isolated development

**Status: Present**

Ivaldi has deep worktree support: creation, discovery, ordering, isolation, branch/upstream handling, session ownership, management UI and PR-aware workflows.

## Multi-run / parallel model comparison

**Status: Present**

Multi-run and fusion already provide parallel run/model comparison. Do not confuse this with the missing agent-team coordination layer.

## MCP

**Status: Present**

MCP configuration and runtime use exist, including Work-mode management and mobile access.

The remaining enterprise gap is centrally enforced MCP admission policy. Individual configuration should not be mistaken for an organization allowlist/denylist.

## Plugins

**Status: Present at local product level**

Plugin management exists. The gap is richer packaging, organization distribution, policy and marketplace maturity.

## Skills

**Status: Present**

Ivaldi has skill creation/editing and a Skills Catalog. The gap is workflow packaging, sharing/versioning and Record & Replay authoring.

## Agent memory

**Status: Present**

The server includes agent memory with global/project scopes and update/delete routes. Session knowledge also has safety handling.

Potential future polish: make memory more legible/editable to normal Work users and show why a memory was applied.

## Browser and browser annotations

**Status: Present**

The desktop browser is a real browser with persistent login state, agent control, screenshots and user annotations. This is already a differentiator.

The remaining gap is deeper developer instrumentation and more general artifact annotation.

## Windows Computer Use

**Status: Present**

Ivaldi has a native Windows Computer Use helper with a per-session lease and screenshot attachments.

The gap is platform coverage, locked/remote execution, Appshots and workflow recording.

## Scheduled tasks

**Status: Present**

Server-side scheduled tasks already exist, including task UI and agent execution settings.

The gap is event triggers, cloud/self-hosted workers and a unified review inbox.

## Goal mode

**Status: Present**

Ivaldi has session goals, auditing, token budgets and ongoing goal behavior. The Work `/plan` UX is separate and should not replace goals.

## Permission auto-accept

**Status: Present**

Persistent server-side auto-accept exists and inherits across subagents. The missing layer is risk-aware automatic review plus a hard execution sandbox.

## Remote instances / relay / mobile

**Status: Present and relatively strong**

Ivaldi already has remote instances, secure relay/tunnel infrastructure, a native mobile shell, push notifications and remote session interaction. This is much closer to Codex Remote than it first appears.

The gap is polished parity for every live developer artifact/approval and vendor/self-hosted cloud workers, not basic remote access.

## Voice

**Status: Present**

Ivaldi has dictation and TTS across browser/local/OpenAI-compatible options plus mobile support.

## GitHub / PR workflows

**Status: Present**

GitHub issues, PRs, checks, annotations and review automation exist. The gap is productizing automated review/security into simple repository-level services.

## Headless/API operation

**Status: Present**

Ivaldi has a headless/API-only server mode. The gap is a stable external developer product around it: scoped service tokens, SDK, event streams, portable durable session storage and worker orchestration.

## Conversation branching, revert and history

**Status: Present**

Ivaldi has branchable/forkable conversation history and revert behavior. This should remain distinct from file checkpoints.

## Multiple providers/models

**Status: Present**

Ivaldi is significantly more provider-neutral than either Claude Code or Codex. Preserve this advantage.

---

# 9. Competitor-specific features with lower priority

These are real differences but should not displace the higher-impact work above.

## Codex profile / personal activity view

Useful, but mostly analytics/profile polish. Organization analytics matters more first.

## Searchable terminal prompt history

Claude Code has terminal-specific history improvements. Ivaldi's GUI/session model already reduces the value of copying terminal UX directly.

## Personality presets

Codex exposes personality choices. Ivaldi could eventually add response-style presets, but this is not a harness capability gap.

## Billing/rate-limit account features

Do not build product features solely to mirror vendor-specific credit/reset mechanics.

## Vendor cloud identity integration

OpenAI/Anthropic can exploit their own account/workspace clouds. Ivaldi should prefer provider-neutral organization identities and self-hosted options rather than copy vendor-specific plumbing.

---

# 10. Recommended implementation order

## Phase A: safe autonomy foundation

Build these together because each strengthens the others:

1. OS-level execution sandbox.
2. Network policy/proxy.
3. Risk-aware automatic approval mode.
4. Tool-output prompt-injection screening.
5. Trust-on-open for project configuration.
6. Automatic file checkpoints + rewind.
7. User lifecycle hooks.
8. First-class background processes.

This would materially improve Ivaldi even if nothing else on this document were built.

## Phase B: agent orchestration

1. Generic peer-session identity/discovery protocol.
2. Cross-session send/request/wait/completion-subscription primitives.
3. Fleet view with Needs input / Working / Ready for review / Done states.
4. Shared task-board/result-registry primitive.
5. Agent teams on top of existing subagents and peer sessions.
6. Dynamic workflow runtime for rerunnable fan-out/fan-in orchestration.
7. Worktree conflict/ownership strategy.
8. User takeover/inspection.
9. Team/workflow budgets and completion criteria.
10. Unified review inbox.

Do not replace Multi-run. Agent Teams and Multi-run solve different problems.

## Phase C: automation platform

1. Versioned Ivaldi Agent Server protocol covering sessions, turns, streaming events, approvals and auth.
2. Generate/publicize Node + Python SDKs from that contract.
3. Versioned `SessionStore` contract with local plus clustered storage adapters and host-to-host resume tests.
4. Generic trigger model.
5. Authenticated live channel/event-inbox primitive for active sessions.
6. Webhook trigger endpoint.
7. Gmail/Slack/Teams/GitHub/Linear trigger adapters through plugins/MCP/apps.
8. Worker queue/control plane.
9. Self-hosted isolated workers with leases, heartbeats and resumable jobs.
10. Scoped service tokens for simple integrations.
11. Workload identity federation for CI/Kubernetes/worker pools.
12. Retry/resume/idempotency and durable result delivery.

## Phase D: extension ecosystem

1. Plugin manifest that bundles skills + MCP/apps + instructions.
2. Versions/dependencies/permissions.
3. Bundle agents + hooks + optional LSP/tooling integrations.
4. Official/custom marketplace source model.
5. User/project/local/managed install scopes.
6. Private organization registry and project recommendations.
7. Share/install/update/rollback.
8. Admin approval and RBAC.
9. Signed/publisher identity.

## Phase E: Work-mode differentiation

1. WebMCP/site-tool discovery in the existing browser.
2. Appshots.
3. Record & Replay -> Skill.
4. Office artifact viewers/editors.
5. Universal annotations.
6. Shareable Sites/internal mini-apps.
7. Teams/Slack ambient agent presence.
8. Shared workspace agents.
9. Agent migration/import wizard for Claude Code/Codex/Cursor/OpenCode ecosystems.
10. Privacy-first Computer History/activity timeline after policy/security foundations exist.

This is where Ivaldi can become more than "Codex with fewer buttons." It can become one agent workspace that makes the same underlying harness useful to office workers and developers.

## Phase F: enterprise and specialist products

1. RBAC/policy engine.
2. Centrally managed MCP admission policy with allowlists/denylists and managed entries.
3. Organization-enforced process launcher integrated with the sandbox/process runtime.
4. Multi-provider enterprise gateway with SSO, model routing and hard spend policy.
5. Audit/compliance log API.
6. Organization analytics + OTLP/observability export.
7. Managed credential broker.
8. Git provider abstraction and first-class GitLab support.
9. Linear/Jira/Azure DevOps delegation surfaces.
10. Productized multi-agent code review.
11. Dedicated security agent.
12. More IDE integrations.

---

# 11. Highest-value five if we only choose five

If development capacity is constrained, I would choose these five:

1. **Sandbox + network isolation.** It is the prerequisite for trustworthy autonomy.
2. **Hooks.** Small implementation surface relative to how much extensibility they unlock.
3. **Checkpoints / rewind.** Immediately makes long autonomous changes safer and easier to supervise.
4. **Agent orchestration fabric.** Cross-session messaging + completion callbacks + fleet supervision first, then Teams and dynamic workflows on top.
5. **Event-triggered automation.** Turns Work mode from a chat client into an actual work agent.

The next feature after those five should be the **Ivaldi Agent Server + public SDK**, because it turns the same runtime into an ecosystem platform and gives worker pools, IDEs, integrations and third-party clients one stable contract. After that I would build the plugin distribution/admin layer and Appshots/Record & Replay.

---

# 12. Where Ivaldi can beat both instead of copying them

There are several areas where the existing architecture gives Ivaldi a credible path to be better rather than merely equal.

## One harness for Work and Developer

The current mode split is strategically valuable. Keep one capable runtime, then expose different levels of observability and controls. Do not fork into a weak office agent and a strong developer agent.

## Provider neutrality

Claude Code and Codex are tied to their vendors' models. Ivaldi already supports multiple providers. Preserve provider-neutral agents, skills, plugins and teams.

## Self-hosted autonomy

Instead of forcing cloud tasks through a vendor SaaS environment, Ivaldi can offer a worker pool that enterprises run on-prem or in their own cloud.

The stronger version is a **heterogeneous worker fabric**: one organization can register normal Windows office machines, locked-down Linux/Kubernetes coding workers, GPU boxes and private-network workers. Tasks declare capabilities and policy requirements; the scheduler chooses an eligible host. Neither Claude nor Codex has Ivaldi's provider-neutral/self-hosted starting point for combining those targets behind one UX.

## Open agent protocol rather than another closed client

A first-class Ivaldi Agent Server should be treated as a product boundary, not only an internal API cleanup. Keep the protocol and generated client libraries provider-neutral so another desktop app, IDE, automation service or customer product can embed the same Ivaldi agent lifecycle without being coupled to OpenCode internals.

If the protocol covers approval requests, questions, artifacts, session events, Computer Use/browser state and remote execution as well as text turns, Ivaldi can offer a more complete self-hostable embedding layer than a simple "call an LLM" SDK.

## Computer + browser + office tools in one agent

The Windows Computer Use helper, desktop browser, mobile client and Work mode can become a unified office automation stack rather than separate products.

## Shared extension model

If Plugins become bundles of Skills + MCP/apps + agent instructions + policy, the same package can work in Work and Developer mode with different presentation.

## Human supervision across devices

Ivaldi already has much of the transport and mobile architecture needed for remote supervision. A polished Inbox + approvals + screenshots + questions + task status could make long-running self-hosted agents unusually usable.

---

# 13. Explicit competitor gap inventory

This appendix is intentionally repetitive with the deeper sections above. Its purpose is fast parity scanning: "does Claude/Codex have a named product primitive that Ivaldi still lacks or only partially covers?"

## 13.1 Claude Code features Ivaldi still lacks or only partially covers

| Claude capability | Ivaldi status | Closest Ivaldi capability | Gap to close |
| --- | --- | --- | --- |
| OS filesystem/network sandbox | Missing | permissions + auto-accept | Real process isolation and egress policy. |
| Auto Mode / risk-aware autonomous approvals | Missing | binary persistent auto-accept | Contextual risk classification and policy reviewer. |
| Tool-output prompt-injection screening | Missing | narrow memory/knowledge safety handling | Central trust-boundary filter for browser/MCP/files/commands/apps. |
| Automatic file checkpoints + code/conversation rewind | Missing | session revert/fork + Git | Non-Git snapshots tied to turns/tool mutations. |
| Full lifecycle hook system | Missing | internal OpenCode/plugin hooks | User/team hooks across session, prompt, tool, permission, task, worktree and config events. |
| Agent teams | Partial | subagents + Multi-run | Peer agents, shared tasks, messages, ownership and team completion. |
| Agent view | Partial | global sidebar/session status | Dedicated fleet command center with dispatch, concise live summaries, peek/reply and needs-input queue. |
| Cross-session messaging | Partial | `openchamber` session create/send/messages | Agent-native peer discovery/message/wait/completion callbacks; current tool explicitly avoids self-delegation. |
| Dynamic workflows | Missing | subagents, Multi-run, scheduled prompts | Rerunnable scripted orchestration with fan-out/fan-in and typed intermediate state. |
| Persistent background-agent supervisor | Partial | remote/server sessions + process infrastructure | Explicit backgrounding, keepalive, restart/recovery and agent-fleet lifecycle. |
| Background command/process ownership | Partial | Terminal/process APIs | Agent-owned watcher/dev-server lifecycle with tail/stdin/health/cleanup. |
| Channels | Missing | MCP + notifications + runtime SSE | Authenticated external events pushed into an already-running session. |
| Remote permission relay through channels | Missing | mobile approvals/remote access foundations | External trusted channel can answer pending permission/question with policy isolation. |
| Routines with GitHub/API/event triggers | Missing | time-based Scheduled Tasks | Event/API triggers and cloud/worker execution. |
| Vendor cloud execution | Missing | remote/self-hosted hosts | Disposable execution without a persistent user-operated host. |
| Self-hosted ephemeral runner pool | Missing | normal Ivaldi server/remote host | Queue, leases, heartbeats, requeue, draining, ephemeral workers. |
| Verifiable self-hosted session identity | Missing | bearer/session auth | Signed per-session principal token usable by internal services. |
| Agent SDK | Partial | headless HTTP/CLI control | Supported embeddable lifecycle SDK with streaming/approvals/session state. |
| Prompt-bearing repo deep links | Partial | `openchamber://new-session` | Repo-slug resolution, inert prefilled prompt and external-origin warning. |
| Plugin marketplace sources/scopes | Partial | Plugins + Skills Catalog | Official/custom marketplaces, project suggestions, managed scopes, version/update governance. |
| Bundled hooks/agents/LSP in plugins | Partial | plugins/skills/MCP separately | One portable workflow package with lifecycle and tooling extensions. |
| Claude Tag / ambient Slack channel agent | Missing | no first-class Slack/Teams agent surface | Persistent shared channel agent, memory, triage, long-task handoff and admin policy. |
| Advisor tool | Partial | subagents / Multi-run | First-class independently configured second-opinion model callable by main agent. |
| Ultrareview / deeper multi-agent review | Partial | PR review agents and automation | Independent verification/fan-out before publishing findings. |
| JetBrains integration | Missing | VS Code extension | First-class JetBrains client. |
| macOS Computer Use | Missing | Windows Computer Use | Native Mac execution/observation path. |
| Per-session simulator integration | Missing / low priority | project shell actions | Simulator as inspectable interactive runtime target. |
| Managed OpenTelemetry/agent monitoring | Partial | internal perf/event instrumentation | Supported OTLP/audit/operations export contract. |
| Enterprise policy distribution | Missing | scattered settings | Organization-managed runtime/plugin/tool/model/permission policy. |
| Managed MCP allowlists/denylists | Missing | user-managed MCP settings | Runtime-enforced organization policy for which MCP servers and tools may connect. |
| Corporate process launcher/wrapper | Missing | direct terminal/process execution | Mandatory organization wrapper for every agent-spawned process. |
| Claude apps / LLM gateway controls | Missing / Partial | provider settings + quota display | SSO, group model access, centralized credentials/routing, telemetry and enforced spend limits. |
| External Agent SDK session storage | Missing as supported contract | local persisted application sessions | Portable session-store adapter so another host can resume an embedded agent. |

## 13.2 Codex / ChatGPT agent-platform features Ivaldi still lacks or only partially covers

| Codex capability | Ivaldi status | Closest Ivaldi capability | Gap to close |
| --- | --- | --- | --- |
| Native workspace sandbox + network policy | Missing | permissions + auto-accept | OS isolation rather than prompts alone. |
| Auto-review of sandbox boundary approvals | Missing | auto-accept | Risk-aware reviewer agent and deterministic policy. |
| Codex App Server | Partial | headless server + internal APIs | Versioned bidirectional protocol for threads, turns, events, approvals, auth and clients. |
| Codex Node/Python SDK | Partial | CLI/HTTP routes | Stable public SDK backed by the same app-server contract. |
| Codex cloud isolated environments | Missing | remote hosts | Disposable queued task environments. |
| Lifecycle hooks | Missing | internal plugin hooks | Supported user/workspace hook API. |
| Appshots | Partial | Computer Use screenshots | One-action attach-current-window with screenshot + available app text. |
| Record & Replay | Missing | Computer Use + skills | Demonstrate workflow once, convert trace into reusable skill. |
| Computer History | Missing | memory + browser/CU history | Opt-in cross-app activity timeline feeding recall, memory and workflow discovery. |
| WebMCP site tools | Missing | browser + MCP separately | Discover structured tools from current signed-in page automatically. |
| Import from Claude Code/Cursor | Missing | no migration layer | Instructions/settings/skills/plugins/projects/recent-work import + optional sync. |
| Workload identity federation | Missing | bearer/service auth | OIDC/SPIFFE short-lived machine identity exchange. |
| Enterprise service accounts/scoped tokens | Partial | server auth/headless APIs | Managed machine principals, granular scopes, expiry/rotation/revocation. |
| GitHub event-triggered action surface | Partial | GitHub integration + internal CI/review | Generic user-configurable event automation product. |
| Linear task delegation | Missing | possible MCP access | Assign issue/@Ivaldi starts linked task and reports progress/results in Linear. |
| GitLab MR review | Missing | GitHub PR integration | GitLab comments/discussions, webhooks, automatic review triggers, self-managed support. |
| Slack-native delegation | Missing | no first-class Slack task surface | Mention/thread -> linked Ivaldi task -> updates/result. |
| Productized automatic code review | Partial | strong internal PR-review stack | Repository-level setup, triggers, policies, finding lifecycle and analytics. |
| Codex Security | Missing | ordinary review agents | Threat model, exploit validation, specialist security findings/fix workflow. |
| Sites | Missing | generated files/browser preview | Persistent shareable interactive agent-built work products. |
| Artifact-native DOCX/XLSX/PPTX/PDF workspace | Partial | files + generic tools | In-place viewing/editing/annotation loops for office artifacts. |
| Cross-platform Computer Use | Partial | Windows CU | Mac/other platform coverage and richer remote policy. |
| Plugin workspace management | Partial | local Plugins/Skills/MCP | Team sync, admin policy, private distribution and permission manifests. |
| Enterprise analytics/compliance APIs | Partial | Usage + internal metrics | Org adoption/cost/audit APIs and retention/export controls. |
| Event-triggered Scheduled Tasks | Missing | daily/weekly/once/cron | App-event conditions for Gmail/Slack/GitHub/etc. |
| GitHub Action product | Partial | repo CI/review internals | Installable/public CI action with scoped auth and stable contract. |
| Runbook-safe external prompt links | Partial | OpenChamber deep links | Safe prefilled-prompt launch with source provenance. |

## 13.3 Competitor capabilities that should **not** be counted as Ivaldi gaps

These are already covered well enough that parity work should target quality rather than rebuilding the concept:

- basic subagents;
- nested agent/task sessions;
- Git worktrees and isolated parallel development;
- parallel model runs / fusion;
- MCP configuration and execution;
- local plugins;
- skills and a skill catalog;
- persistent agent memory;
- browser interaction and annotations;
- Windows Computer Use;
- time-based scheduled tasks;
- goal mode / long-running completion intent;
- persistent permission auto-accept;
- remote hosts, secure relay and native mobile supervision;
- notifications and mobile deep-links into sessions;
- voice/dictation;
- GitHub issue/PR workflows;
- headless server and CLI control primitives;
- conversation fork/revert/history;
- LSP tool-call/diagnostic rendering;
- multi-provider/model support.

The strategic rule is: **do not spend months cloning a competitor label where Ivaldi already has the primitive. Build the missing safety, orchestration, distribution and workflow layers around the strengths that already exist.**

---

# Public competitor sources checked

The comparison was refreshed against public material available on 2026-09-02, including:

- Anthropic: Claude Code sandboxing engineering article.
- Anthropic: Claude Code Auto Mode engineering article.
- Anthropic: Claude Code autonomous-work/checkpoint announcement.
- Anthropic: Claude Code Foundations and Advanced Patterns material.
- Anthropic: agent-teams / parallel-Claude material.
- Anthropic: **Manage multiple agents with agent view**.
- Anthropic: **Message your other Claude Code sessions**.
- Anthropic: **Orchestrate subagents at scale with dynamic workflows**.
- Anthropic: **Push events into a running session with channels**.
- Anthropic: **Automate work with routines**.
- Anthropic: **Launch sessions from links**.
- Anthropic: **Self-hosted environments** and **Verify session identity in self-hosted environments**.
- Anthropic: **Escalate hard decisions with the advisor tool**.
- Anthropic: current Hooks and plugin-marketplace documentation.
- Anthropic: **Control MCP server access for your organization** and managed/server-managed settings documentation.
- Anthropic: **Run Claude Code behind a corporate launcher**.
- Anthropic: **Run Claude Code through a gateway**, **Claude apps gateway** and **Claude apps gateway spend limits**.
- Anthropic: **Persist sessions to external storage** plus Agent SDK production-hosting guidance.
- OpenAI: Codex app announcement and current Codex updates.
- OpenAI: Work with Codex from anywhere.
- OpenAI: Codex for every role, tool, and workflow.
- OpenAI: Plugins in ChatGPT and Codex.
- OpenAI: Running Codex safely at OpenAI.
- OpenAI: current Codex documentation index (`developers.openai.com/codex/llms.txt` / ChatGPT Learn docs map).
- OpenAI/openai-codex: **codex-app-server** protocol documentation.
- OpenAI: **Codex SDK**.
- OpenAI: **Import from another agent**.
- OpenAI: **Computer History**.
- OpenAI: **Site tools / WebMCP**.
- OpenAI: **Workload identity federation**.
- OpenAI: **Use Codex in Linear**.
- OpenAI: **Review GitLab merge requests with Codex**.
- OpenAI: Codex Security documentation.
- OpenAI: ChatGPT Work and Codex event-triggered task documentation.
- OpenAI: current Codex plan/help documentation including Record & Replay.

The competitor feature set changes quickly. Re-run the public-source audit before using this document for a long-term roadmap or parity claim.
