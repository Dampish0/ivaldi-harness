# Session Goal

Server-side control loop that keeps a session working toward a user-defined
objective stored under `metadata.openchamber.goal`, with the small model as
an independent progress auditor. Built on OpenChamber's backend-driven
architecture (session-assist is the structural template): the loop lives in
the web server and survives UI disconnects.

## Goal payload (`metadata.openchamber.goal`)

```
{
  id,                      // opaque per-logical-goal id; stale-write guard
  objective,               // inline user text (fallback), <= 5000 chars
  objectiveFile,           // true: objective text lives in a server-side file
  status,                  // active | paused | blocked | budgetLimited | complete
  tokenBudget,             // optional positive int
  tokensUsed,              // tokensCommitted + current segment (snapshot - baseline)
  tokensBaseline,          // segment start snapshot (pre-goal turn; 0 after compaction)
  tokensCommitted,         // closed segments' total (one segment per compaction)
  turnsUsed,               // auto-continuations sent (capped at MAX_AUTO_TURNS)
  blockedStreak,           // consecutive blocked audit verdicts
  auditFailStreak,         // consecutive failed/unavailable audit calls
  note,                    // latest audit progress note, <= 280 chars
  statusReason,            // why settled; 'resumed' is a kickoff signal from UI
  evaluationProviderID,    // provider used by the latest successful audit
  evaluationModelID,       // model used by the latest successful audit
  lastAccountedMessageID,  // incremental accounting cursor
  continuationAfterMessageID, // assistant tail reserved before continuation dispatch
  createdAt, updatedAt
}
```

The UI writes goals (create/edit/pause/resume/clear) by patching this
metadata; the runtime never creates a goal on its own. Goal creation happens
at send time via the arm store (`useSessionGoalArmStore`): the composer
target button arms "the next prompt is the objective", and the run-as-goal
flows (fork-from-answer dialog, plan implement dialog) arm the same way —
the plan flow additionally supplies an objective OVERRIDE carrying the plan
content, since "Implement this plan: X" alone gives the audit nothing to
judge against. The armed send also attaches a synthetic system-reminder
part telling the agent goal mode is active and that each turn should end
with a factual done/verified/remaining statement for the independent audit.
Every runtime write re-reads the session and requires the same goal `id` and
`updatedAt`, an active status, and an unarchived session. Metadata updates use
the upstream read/merge/write API, which has no compare-and-swap transaction.

## File-backed objectives

The objective TEXT lives in `<data-dir>/goals/<sessionId>.md` (data dir =
`OPENCHAMBER_DATA_DIR` or `~/.config/openchamber`), keyed by the SESSION ID:
sessions are globally unique and carry one goal at a time, so the mapping is
deterministic and a new goal simply overwrites the file. Metadata carries
only `objectiveFile: true` — never a path — so user-writable metadata cannot
become a file-read vector (`objectives.js` also validates the id shape
before touching the filesystem). Rationale: metadata rides every
`session.updated`, so multi-KB objectives must not live there.

- `objectives.js` — write/read/delete, 5000-char clamp.
- `routes.js` — `PUT/GET/DELETE /api/goals/objective/:sessionId`
  (OpenChamber-owned, registered before the generic proxy; JSON parsing via
  the `/api/goals` family in core-routes). The UI writes the file BEFORE
  patching the goal metadata and falls back to an inline objective when the
  write fails; `clearSessionGoal` deletes the file best-effort.
- The tick resolves the effective objective fresh on every cycle (the file
  is live-editable mid-goal) and falls back to the inline `objective` when
  the file is unreadable — a goal never dies because a file went away.
- UI display fetches content via the GET route
  (`useGoalObjectiveContent`); in VS Code the route is unavailable, so the
  strip degrades to the audit note (display-only fallback by design).
- Server-created goals write the file through `create.js`, which also owns
  objective fitting, inline fallback, metadata creation, and the synthetic
  first-turn reminder shared by scheduled tasks and CLI-created sessions.

## Flow

1. Server startup calls `sessionGoalRuntime.start(globalMessageStreamHub)`.
   `recovery.js` subscribes to the existing hub's connection status. Initial
   connection and reconnect scan `/experimental/session` in pages of 200,
   following `x-next-cursor` or the last updated timestamp. The inclusive
   archived query retains rows with `archived: 0`; actual archives and child
   sessions are filtered locally. Each active root goal arms an idle timer with
   its own directory. Event delivery still uses the server's shared subscriber.
   Partial failures preserve already recovered sessions and retry discovery
   with exponential delay from 1 to 60 seconds. Malformed records do not block
   valid records. There is no scan on each session event or steady-state poll.
2. `session.status: idle` arms a 15s per-session timer; `busy`/`retry` clears
   it. A `session.updated` carrying a fresh active goal (`turnsUsed === 0` or
   `statusReason === 'resumed'`) arms a kickoff timer — 3s for fresh goals,
   ~250ms for an explicit Resume so the nudge feels immediate — since setting
   a goal on an idle session emits no status transition.
3. On fire (`tick`), gated by the `sessionGoalEnabled` setting:
   - fetch session (skip sub-agent sessions), require an `active` goal;
   - authoritative live-activity check after the quiet window: re-read the
     session status map, bail if the parent resumed, then list direct child
     sessions and bail while any child is `busy`/`retry`. A background
     subagent leaves its parent idle, then injects its result into the parent
     when done; that parent `busy` → `idle` cycle re-arms the loop without
     polling. Status/children fetch failure is unknown, not empty, so it skips
     the audit and retries after another quiet window;
   - quiescence check via the message tail. Normal event ticks wait for a
     trailing user message or unfinished assistant reply. Recovery with an
     authoritative idle session blocks such an interrupted turn for inspection.
     The user sends a message to continue the conversation, then resumes the
     goal. Failed transcript reads retry without assuming empty history;
   - token accounting as a SNAPSHOT of the latest completed assistant turn:
     `input + cache.read + output`. Earlier turns' inputs and outputs fold
     into the next turn's cache, so the latest snapshot already carries the
     whole run's paid tokens — no summing across messages. Goal-relative via
     `tokensBaseline` (the same snapshot of the newest pre-goal turn,
     captured on the first tick). Compaction (an assistant message with
     `summary: true`) breaks the snapshot chain, so accounting is segmented:
     the summary message closes the segment into `tokensCommitted` (the
     summary turn read the whole context, so its snapshot prices the
     compaction itself) and the next segment starts with a zero baseline.
     `tokensUsed = tokensCommitted + current segment`, kept monotonic so
     unflagged context shrinks never move the budget backwards;
   - a user abort pauses the goal instead of blocking it: the event path in
     `processPayload` pauses immediately on the MessageAbortedError message
     (before any tick could send a continuation over the user's explicit
     stop), with a tick-side safety net. Messages sent while paused leave
     the goal alone; Resume re-arms the loop, and resuming over an aborted
     tail skips the audit and goes straight to a continuation nudge;
   - terminal checks, cheapest first: assistant turn error → `blocked`;
     `tokensUsed >= tokenBudget` → `budgetLimited`;
     `turnsUsed >= MAX_AUTO_TURNS` (20) → `blocked`;
   - if the latest message is a compaction summary, skip the audit and
     continue unconditionally — running into the context window mid-work is
     by definition "in progress, not finished" (the summary is a retelling,
     not evidence, and must not be judged);
   - otherwise, small-model audit of the objective + the last assistant turn
     only — no conversation history and no continuation prompts
     (`restrictToPreferredProvider`, session's own provider/model preferred):
     JSON `{verdict: continue|complete|blocked, note}`. The audit is the SOLE
     termination authority besides the hard stops above — the working agent
     has no channel to settle its own goal. `complete` settles; `blocked`
     increments `blockedStreak` and settles only after 3 consecutive blocked
     verdicts, so a one-off snag cannot end the goal. Audit failure/absence
     tolerates ONE consecutive unaudited continuation (`auditFailStreak`); a
     second consecutive failure settles the goal as `blocked` ("progress
     audit unavailable") — resumable, and settling resets the streak so
     Resume gets fresh tolerance. A dead small model can never drive the
     loop blind to the turn cap;
   - continue: recheck the tail and parent/child live activity, then persist
     accounting, `turnsUsed`, and `continuationAfterMessageID` before
     `POST /session/:id/prompt_async` with the
     synthetic continuation prompt using the last assistant message's
     provider/model/agent — the goal spends the session's own subscription.
4. Settling (`complete`/`blocked`/`budgetLimited`) fires the injected
   `emitGoalNotification` so the user hears about it even with the UI closed:
   desktop + UI broadcast + the standard push fanout (web-push with full
   text; APNs with a generic per-type title and the session name as body).
   It obeys the notify-on-completion setting. Conversely, while a goal is
   ACTIVE the notifications runtime suppresses per-turn "ready"
   notifications on every channel — they would only echo the loop's own
   continuations; error/question/permission notifications are untouched.
   Pausing a goal from the UI also aborts the running turn (and vice versa —
   an abort pauses the goal), so "stop" means stop on both axes.

## Recovery and dispatch uncertainty

`continuationAfterMessageID` reserves a continuation against a completed
assistant tail before sending. Existing goals without the field remain valid.
UI pause, resume, and edit operations preserve it through their metadata merge.
A newer completed assistant message permits normal accounting and audit.
If the reserved tail remains unchanged, recovery cannot tell whether a lost
request was accepted. It blocks with a delivery reason and does not resend.
After inspecting live work, the user can explicitly Resume to authorize another
attempt. `turnsUsed` counts reserved attempts, including uncertain delivery.

Disconnect and stop abort pending work, clear timers, and cancel discovery
retries. Reconnect starts fresh recovery without waiting for a stale audit.
Late audit results cannot write metadata or dispatch. Stop also removes the
status subscription. Missing objective files with no inline fallback become
blocked with an actionable reason.

This is a single-runtime contract. Multiple independent Ivaldi servers must not
control goals on the same upstream. The upstream metadata API cannot atomically
claim a continuation across processes. Recovery does not roll back or replay
unfinished tool actions. A reserved request interrupted before dispatch may
need user inspection even when it never reached OpenCode.

Run `bun run --cwd packages/web test server/lib/session-goal server/lib/event-stream`
for unit and HTTP/SSE integration coverage. The HTTP fixture checks the real
shared hub and reconnect path without a provider. Packaged restart, permissions,
and upgrade checks remain in [release readiness](../../../../../docs/RELEASE_READINESS.md).

## Continuation prompt

Built inline in `runtime.js` and sent as a synthetic text part so clients can
keep the orchestration message out of the user-facing transcript: the objective as untrusted user data in an
XML-escaped `<objective>` block, budget numbers, keep-the-full-objective and
work-from-evidence rules, a completion-audit instruction, and the requirement
to end every turn with a factual done/verified/remaining report — the audit
sees only that final turn, so the report is its evidence.

## UI consumers (packages/ui)

- `lib/sessionGoalMetadata.ts` — payload parsing/types.
- `lib/sessionGoalActions.ts` — create/edit/pause/resume/clear via
  `patchSessionMetadata`; `lib/sessionGoalPresentation.ts` — status
  colors/labels shared across surfaces.
- `stores/useSessionGoalArmStore.ts` — the "next prompt starts a goal" flag,
  consumed by `sendMessage` in `sync/session-ui-store.ts` (works for drafts).
  Armed slash commands resolve their authoritative command template and apply
  OpenCode argument expansion (`$ARGUMENTS`, positional placeholders, or the
  implicit argument suffix) for the audit objective before goal metadata is
  written and before `session.command` dispatch. If command details cannot be
  loaded, the raw invocation remains the objective rather than blocking command
  execution.
- `hooks/useSessionGoal.ts` — live goal state.
- `components/chat/SessionGoalButton.tsx` — composer target button
  (arm / status color / cancel confirm); `SessionGoalRow.tsx` — goal strip
  above the composer; `SessionGoalDialog.tsx` — manage dialog
  (edit/pause/resume/complete/clear).
- Sidebar glyph next to the date in `SessionNodeItem`.

## Scheduled goals

Scheduled tasks can run as goals: `execution.goalEnabled` (+ optional
`execution.goalTokenBudget`) on a task makes the scheduled-tasks runtime
stamp `metadata.openchamber.goal` onto the fresh session (objective = the
expanded task prompt, or the argument-expanded command template for a slash
command) and attach the goal-mode intro part to normal prompts.
The loop here picks it up from session events like any other goal.

## CLI-created goals

`openchamber session create --prompt <text> --goal` uses the explicit
`POST /api/openchamber/sessions` orchestration route. The server creates the
session, fits and stores the expanded prompt as its objective, patches active
goal metadata, appends the synthetic goal reminder, and only then dispatches
the prompt. `--goal-token-budget` applies the same optional budget contract as
scheduled goals. Slash commands retain command dispatch semantics and cannot
carry the synthetic prompt part. Their command template with OpenCode argument
expansion becomes the audit objective; goal metadata
is still installed before the command runs. A missing command template falls
back to the raw invocation.

`openchamber session send --goal` and `openchamber session fork --goal` use
the same server-owned prompt orchestration. Send installs a fresh goal on the
target session; fork first uses the official OpenCode fork operation (at the
optional message boundary), then installs the goal on the new session. Both
preserve the objective-file-before-metadata and metadata-before-dispatch
ordering used by create and scheduled goals.

## Limitations

- Web-server feature: VS Code (extension-only) renders goal state via
  `session.updated` but does not run the loop.
- A goal on a session with no assistant reply yet starts after the first
  user exchange completes (no provider/model to continue with before that).
- `tokensUsed` only counts completed assistant messages seen within the
  40-message fetch window per tick; extremely long busy stretches between
  idles undercount (acceptable: budget is a guardrail, not billing).
