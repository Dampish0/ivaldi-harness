# Context Surfaces

## Purpose

`packages/ui/src/lib/surfaces` owns the declarative registry of context panel
surfaces. Desktop/web exposes them through the compact "Panel surfaces" header
menu in `components/layout/ContextPanelRail.tsx` and renders the active surface
in `components/layout/ContextPanel.tsx`.

## Model

- A surface maps 1:1 to a `ContextPanelMode` tab mode in `useUIStore`.
- `availability: 'always'` surfaces are always present in the header menu.
  `availability: 'has-content'` surfaces (chat) are hidden from the
  menu until a tab of their mode exists, and stay visible for as long as one
  does — they must not disappear while in use.
- `defaultWidthFraction` is the panel width as a fraction of the content area,
  used until the user manually resizes that surface (manual widths are stored
  per mode in `useUIStore.contextPanelByDirectory[dir].widthByMode`).
- `useUIStore.contextRailOrder` preserves the historical persisted ordering.
  `sortContextSurfaces` applies it on top of the registry's default order and
  appends any missing surfaces. The current desktop UI has no drag control for
  editing this order.
- `getVisibleContextRailSurfaces` is the single visibility filter shared by the
  header menu and the global surface-switch shortcut (`switch_context_surface` in
  `lib/shortcuts`): it drops surfaces the user hid
  (`useUIStore.contextRailHiddenSurfaces`, edited through `ContextRailSurfacesDialog`
  from the Developer-mode header menu), drops the plan surface
  unless plan mode is enabled,
  drops the walkthrough on VS Code and below `WALKTHROUGH_MIN_WIDTH`, and hides
  `has-content` surfaces until a tab of their mode exists. Both consumers use
  the same ordered list so keyboard cycling and the menu stay aligned.
- Work mode keeps developer-only tab records intact but excludes Git, pull
  request, diff, walkthrough, and terminal tabs from the rendered panel. This
  prevents hidden developer panes from staying mounted or doing background
  work while preserving their state for a later switch back to Developer mode.
- Ivaldi Work mode uses that same filter to remove developer-only modes (`git`,
  `pr`, `diff`, `walkthrough`, `terminal`). Existing tabs are not deleted from
  persisted state; switching to Work closes an open developer-only panel and
  navigation/deep links fall back to a Work-visible surface. Developer mode
  exposes the complete registry again.

## Adding a surface

1. Add a `ContextPanelMode` value in `useUIStore` (type union plus the
   sanitizer whitelist in `sanitizeContextPanelTabs`).
2. Register a descriptor here (icon, label key, availability, width fraction).
3. Render the mode in `ContextPanel.tsx` (content dispatch, label, icon).
4. Add label/hint i18n keys to every locale dictionary.

Keep contextual tools behind the existing header menu rather than adding a
permanent rail or a row of dedicated header buttons. Direct links from chat or
the command palette should go through the `openContext*` actions in
`useUIStore`.

## Invariants

- Opening a surface must remain possible from the header menu, the command
  palette, or an in-content link.
- Multi-instance and session-holding surfaces (file/editor, diff, browser,
  terminal) are keep-alive panes in `ContextPanel.tsx`. Switching these
  surfaces must not reset their state (open tabs, xterm session, scroll
  positions). Chat tab records stay open, but only the active chat iframe is
  mounted while the panel is open. A selected chat restores its state from
  the session stores. A closed panel mounts no chat iframe.
  Singleton surfaces (git, pr, notes, plan, context) remount on switch. These
  surfaces must restore their state from stores or snapshots.
- Runtime scope: desktop/web `MainLayout` only. VS Code and the dedicated
  mobile shell have their own layouts and do not consume this registry.
