# Session Sidebar

Sidebar code is organized by the business object it owns. Shared contracts are
kept at this root in `types.ts` and `utils.tsx`.

- `shell/` owns sidebar chrome, navigation, search, confirmations, and switcher effects.
- `list/` owns global-first session collection, directory bootstrap demand,
  layout-owned synchronization, authoritative cleanup, and nearby-session prefetch.
- `projects/` owns project zones, grouping, ordering, scroller behavior, project
  view state, repository state, and worktree presentation.
- `sessions/` owns session rows, row actions, expansion, ownership, and activity indicators.
- `recent/` owns Recent and managed Chats activity projections.
- `folders/` owns folder DnD, bulk actions, archived folders, and folder UI.

- `SessionSidebar.tsx` now acts mainly as orchestration; core logic moved to focused hooks/components.
- Ivaldi puts New session in `shell/SidebarHeader`; its menu contains Scheduled, Multi-run, and Archive. Managed Chats, Recent, and project sections render through the split collection modules.
- **Two grouping display modes** (`useSessionDisplayStore.sessionGroupingMode`, toggled in the view dropdown): `'by-worktree'` (default) renders the worktree-grouped `sectionsForRender` with slim PR-aware branch sub-headers inside each project zone; `'flat'` renders `flatSectionsForRender` — one merged non-archived group per project (`id: 'flat'`, `folderScopes` listing every contributing scope) with per-row branch markers. Both derive from the same `projectSections` data layer, which alone feeds bootstrap demand planning and PR polling.
- Ivaldi Work mode always renders the flat project view and removes worktree
  creation/management, branch markers, PR decoration and move-to-worktree
  actions. Sessions whose directories are existing worktrees remain in the
  project list and stay selectable; only the repository-oriented presentation
  is removed. Developer mode keeps both grouping choices and all worktree UI.
- **Project display is independent from grouping.** `'all'` keeps every project zone; `'single'` is web/desktop/PWA-only and renders one selected project under the always-present Chats section. Its project header is a non-collapsible picker ordered by the current project sort. Recent and collapse/expand-all controls are hidden without changing their persisted preferences. Opening a materialized project session updates the picker from the session's confirmed directory; changing only a draft target does not. In `'single'` + `'flat'`, active sessions reveal in batches of 20. `'single'` + `'by-worktree'` retains the ordinary per-group limits. Project display mode, session grouping, project sort, and the Recent preference are server-backed shared settings with the hydrated browser store as the migration/failure cache. The selected single project and sticky-header preference remain device-local.
- When sticky zone headers are enabled, project headers are sticky "zone" bands (`SortableProjectItem`); on a vibrant desktop the scrolling content fades behind an unmasked, non-interactive copy of the stuck icon/title without painting a background. The transparent fade zone blocks interaction with obscured rows. The `recent` section uses the same overlay while it is the leading sticky header. Collapsed projects show an aggregated busy/unseen indicator (`ProjectAggregateStatusIndicator`), derived from the live status index and notification store scoped to the project's directories.
- **Activity is a dot plus a counter, never a spinner.** The row's left gutter shows a static dot — primary while the session runs (`busy`/`retry`), info while it is unread — and the metadata slot on the right swaps the goal/branch/date group for the elapsed time of the turn (`SessionActivityDuration`, ticking once per second). The readout takes the dot's color in each state — primary while running, info once it is waiting to be read — so the pair reads as one indicator. A running spinner repainted a composited layer per row every frame for the whole turn; the counter conveys the same "something is happening" at 1 fps. The counter follows the unread marker's lifetime exactly: it survives the turn ending, disappears when the session is read, and never lingers on the session being watched (which is marked read as it goes idle). Aggregate indicators for collapsed groups, folders, and projects show the dot only — a group may hold several running turns, so a single counter would have nothing to count. The same treatment applies to the mobile sessions sheet and session switcher rows. The worktree-move indicator stays a spinner: it marks a short user-initiated operation, not a session state.
- Session rows have a single layout (former `minimal`); the `default`/`minimal` display mode was removed (`session-display-mode` store v4 migration drops the key). Rows show an inline branch label (from `node.worktree` or recent's `secondaryMeta`) when the session lives outside the project root, and bold titles while unread.
- Folders render **flat** after the loose sessions: nested folders keep `parentId` in the data model but display at one level with a "Parent / Child" path label (`SessionFolderItem.displayName`); collapsing a folder hides its whole subtree. Folder actions resolve their owning scope per folder entry (folders from multiple worktree scopes can coexist under one project).
- Archived sessions are not shown in the web/desktop sidebar; the Archive page (`ArchiveView`, `useUIStore.isArchivePageOpen`) replaces the old toggle. VS Code keeps inline archived buckets behind `showArchivedSessions` (compact webview has no page surfaces). Restore (unarchive) is available per session (row context menu, Archive page row) and in bulk (selection bar) and writes `time.archived = 0` — the server cannot clear the field over HTTP, so the global session cache splits active/archived client-side (see "Restore (unarchive) contract" in `sync/DOCUMENTATION.md`).
- Scheduled tasks (`ScheduledTasksDialog`, now a full-page surface on web/desktop) and per-project worktree management (`WorktreesView`, opened from the project menu) render as overlays inside `<main>` in `MainLayout`; the sidebar no longer mounts them.
- Group-level PR-status polling/indicators and worktree-group drag-to-reorder were removed together with the worktree grouping level; `oc.sessions.groupOrder` is no longer read or written. Worktree PR/branch context lives in the Worktrees surface.
- Root session menus can quickly create a worktree from the session directory's current branch and move the full session subtree there while idle.
- Managed Chats never offer the worktree-move action in either the sidebar row menu or the active-session header menu because their directories are not project repositories.
- Managed Chats use the shared Chats root as their folder scope. Their activity section renders the normal folder tree, and sessions created from a Chats folder are assigned back to that root-scoped folder after their date/session directory materializes. Per-session folder scopes created by older builds remain visible for compatibility.
- The Chats zone is omitted while it has no sessions. The always-visible New session action remains the entry point for creating the first managed Chat, and the Chats zone appears once content exists.
- The New session keyboard command inherits the active materialized session directory. Explicit sidebar entry points, including the top New session row and the Chats `+`, open a fresh managed Chat draft instead.
- The new-worktree keyboard command is a silent no-op while a managed Chat draft is open. It must not retarget that draft to the active project or show a Git/worktree error because Chats never participate in worktrees.
- Directory loading is demand-driven: the sidebar publishes one complete priority plan for all known project/worktree directories, while the sync layer owns bounded execution.
- Work mode still includes known worktree directories in session ownership and
  bootstrap demand so existing sessions do not disappear, but it skips sidebar
  Git/PR enrichment and worktree discovery UI that exists only to decorate or
  manipulate the developer view.
- When multiple configured projects are checkouts of the same Git repository, exactly one project owns the shared worktree topology: the configured canonical primary root when present, otherwise the first configured source for that repository. Any worktree path that is also a configured project is omitted from subordinate worktree groups, so every directory has one sidebar location while remaining part of bootstrap demand.

`MainLayout` and `VSCodeLayout` call `useSessionListSync({ isVSCode })`
unconditionally. The hook publishes complete directory bootstrap demand,
refreshes newly added topology, coalesces control events, and performs
authoritative cleanup. Root-level `useGlobalSessionsPolling` remains the only
initial and 45-second global poller. `useSessionListSync` must not create a
second global polling lifecycle.

The global sessions cache is the complete source for active and archived
coverage. Initialized directory stores only supply sessions missing from that
cache. Live busy and retry state comes from `global-session-status`, never from
the global cache or persisted history. A failed global or directory fetch keeps
existing data; it is never treated as an authoritative empty list.

Web and desktop show managed Chats before optional Recent activity. Chats use
their shared managed root for folders and never expose worktree actions. Project
display can be all projects or one selected project. VS Code excludes worktrees
and managed Chats, while retaining its workspace-scoped grouped list and inline
archived buckets.

Directory demand always includes known project roots and worktrees. Visibility
only changes priority. Row mounts must not start bootstrap work. Selection and
activity subscriptions stay session-scoped so a structural list update does not
make every row observe unrelated streaming updates.
