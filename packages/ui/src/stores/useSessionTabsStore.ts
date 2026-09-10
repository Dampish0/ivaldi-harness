import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { createDeferredSafeJSONStorage } from '@/stores/utils/safeStorage';

/**
 * The header's working set of sessions, shown as tabs on web/desktop.
 *
 * Session ids and their order are the durable working set. A bounded title
 * snapshot is kept alongside each recent tab so the strip can paint
 * immediately on a cold launch instead of waiting for the global session list.
 * Those snapshots are display continuity only; live session metadata remains
 * authoritative for navigation, actions, status and reconciliation. Tabs are
 * a per-client projection: closing one never touches the session itself.
 */
interface SessionTabsStore {
  tabIds: string[];
  closedTabIds: string[];
  tabSnapshots: Record<string, SessionTabSnapshot>;

  ensureTab: (sessionId: string) => void;
  rememberTabSnapshots: (snapshots: readonly SessionTabSnapshot[]) => void;
  closeTab: (sessionId: string) => void;
  closeOtherTabs: (sessionId: string) => void;
  reopenLastClosedTab: () => string | null;
  reorderTabs: (activeId: string, overId: string) => void;
  /** Drop ids the caller has authoritatively confirmed no longer exist. */
  removeTabs: (sessionIds: readonly string[]) => void;
}

const MAX_SESSION_TABS = 10;
const MAX_CLOSED_SESSION_TABS = 10;

export type SessionTabSnapshot = {
  id: string;
  title: string;
};

type PersistedSessionTabs = {
  tabIds: string[];
  closedTabIds: string[];
  tabSnapshots: Record<string, SessionTabSnapshot>;
};

const pruneSnapshots = (
  snapshots: Record<string, SessionTabSnapshot>,
  tabIds: readonly string[],
  closedTabIds: readonly string[],
): Record<string, SessionTabSnapshot> => {
  const keep = new Set([...tabIds, ...closedTabIds]);
  let changed = false;
  const next: Record<string, SessionTabSnapshot> = {};
  for (const [id, snapshot] of Object.entries(snapshots)) {
    if (keep.has(id)) next[id] = snapshot;
    else changed = true;
  }
  return changed ? next : snapshots;
};

export const useSessionTabsStore = create<SessionTabsStore>()(
  devtools(
    persist(
      (set, get) => ({
        tabIds: [],
        closedTabIds: [],
        tabSnapshots: {},

        ensureTab: (sessionId) => {
          if (!sessionId) return;
          const { tabIds, closedTabIds } = get();
          if (tabIds.includes(sessionId)) return;
          // Soft cap: with auto-add the strip only ever grows, so past the cap
          // the oldest tab (never the one being opened, which lands last)
          // leaves the working set.
          const next = [...tabIds, sessionId];
          const nextTabIds = next.length > MAX_SESSION_TABS ? next.slice(next.length - MAX_SESSION_TABS) : next;
          const nextClosedTabIds = closedTabIds.filter((id) => id !== sessionId);
          set({
            tabIds: nextTabIds,
            closedTabIds: nextClosedTabIds,
            tabSnapshots: pruneSnapshots(get().tabSnapshots, nextTabIds, nextClosedTabIds),
          });
        },

        rememberTabSnapshots: (snapshots) => {
          if (snapshots.length === 0) return;
          const state = get();
          const keep = new Set([...state.tabIds, ...state.closedTabIds]);
          let changed = false;
          const next = { ...state.tabSnapshots };

          for (const snapshot of snapshots) {
            if (!snapshot.id || !keep.has(snapshot.id)) continue;
            const previous = next[snapshot.id];
            if (previous?.title === snapshot.title) continue;
            next[snapshot.id] = snapshot;
            changed = true;
          }

          if (changed) set({ tabSnapshots: next });
        },

        closeTab: (sessionId) => {
          const { tabIds, closedTabIds } = get();
          if (!tabIds.includes(sessionId)) return;
          const nextTabIds = tabIds.filter((id) => id !== sessionId);
          const nextClosedTabIds = [...closedTabIds.filter((id) => id !== sessionId), sessionId]
            .slice(-MAX_CLOSED_SESSION_TABS);
          set({
            tabIds: nextTabIds,
            closedTabIds: nextClosedTabIds,
            tabSnapshots: pruneSnapshots(get().tabSnapshots, nextTabIds, nextClosedTabIds),
          });
        },

        closeOtherTabs: (sessionId) => {
          const { tabIds, closedTabIds } = get();
          if (!tabIds.includes(sessionId)) return;
          if (tabIds.length === 1) return;
          const closed = tabIds.filter((id) => id !== sessionId);
          const nextClosedTabIds = [...closedTabIds.filter((id) => !closed.includes(id)), ...closed]
            .slice(-MAX_CLOSED_SESSION_TABS);
          set({
            tabIds: [sessionId],
            closedTabIds: nextClosedTabIds,
            tabSnapshots: pruneSnapshots(get().tabSnapshots, [sessionId], nextClosedTabIds),
          });
        },

        reopenLastClosedTab: () => {
          const { tabIds, closedTabIds } = get();
          const candidates = closedTabIds.filter((id) => !tabIds.includes(id));
          const sessionId = candidates.at(-1) ?? null;
          if (!sessionId) {
            if (candidates.length !== closedTabIds.length) set({ closedTabIds: candidates });
            return null;
          }
          set({
            tabIds: [...tabIds, sessionId].slice(-MAX_SESSION_TABS),
            closedTabIds: candidates.slice(0, -1),
            tabSnapshots: pruneSnapshots(
              get().tabSnapshots,
              [...tabIds, sessionId].slice(-MAX_SESSION_TABS),
              candidates.slice(0, -1),
            ),
          });
          return sessionId;
        },

        reorderTabs: (activeId, overId) => {
          const { tabIds } = get();
          const from = tabIds.indexOf(activeId);
          const to = tabIds.indexOf(overId);
          if (from < 0 || to < 0 || from === to) return;
          const next = [...tabIds];
          next.splice(to, 0, ...next.splice(from, 1));
          set({ tabIds: next });
        },

        removeTabs: (sessionIds) => {
          if (sessionIds.length === 0) return;
          const gone = new Set(sessionIds);
          const { tabIds, closedTabIds } = get();
          const next = tabIds.filter((id) => !gone.has(id));
          const nextClosed = closedTabIds.filter((id) => !gone.has(id));
          if (next.length === tabIds.length && nextClosed.length === closedTabIds.length) return;
          set({
            tabIds: next,
            closedTabIds: nextClosed,
            tabSnapshots: pruneSnapshots(get().tabSnapshots, next, nextClosed),
          });
        },
      }),
      {
        name: 'session-tabs-store',
        storage: createDeferredSafeJSONStorage<PersistedSessionTabs>(),
        partialize: (state) => ({
          tabIds: state.tabIds,
          closedTabIds: state.closedTabIds,
          tabSnapshots: state.tabSnapshots,
        }),
      },
    ),
  ),
);
