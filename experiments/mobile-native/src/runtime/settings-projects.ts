import { z } from 'zod';
import type { NativeRuntime } from './connection';

const nonBlank = z.string().refine(value => value.trim().length > 0);
const projectSchema = z.object({ id: nonBlank, path: nonBlank, label: z.string().optional() });
const settingsSchema = z.object({
  projects: z.array(projectSchema).refine(projects => new Set(projects.map(project => project.id)).size === projects.length).default([]),
});

interface SettingsProjectsSnapshot {
  projects: z.infer<typeof projectSchema>[];
  selectedId: string | null;
  ready: boolean;
  loading: boolean;
  error: 'load' | null;
}

/** Settings selection belongs to one connection lifetime and never activates a chat. */
export function createSettingsProjectsStore(runtime: Pick<NativeRuntime, 'json'>, options: { currentDirectory: () => string | undefined | null }) {
  let state: SettingsProjectsSnapshot = { projects: [], selectedId: null, ready: false, loading: false, error: null };
  const listeners = new Set<() => void>();
  const lifetime = new AbortController();
  let pending: { promise: Promise<void>; controller: AbortController } | null = null;
  const publish = (patch: Partial<SettingsProjectsSnapshot>) => {
    if (lifetime.signal.aborted) return;
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const cancelLoad = () => {
    if (!pending) return;
    const cancelled = pending;
    pending = null;
    cancelled.controller.abort();
    publish({ loading: false, error: null });
  };
  const load = (): Promise<void> => {
    if (lifetime.signal.aborted) return Promise.reject(new Error('Settings projects are unavailable'));
    if (pending) return pending.promise;
    const controller = new AbortController();
    const request = Promise.resolve().then(async () => {
      try {
        if (lifetime.signal.aborted) throw new Error('Settings projects are unavailable');
        if (controller.signal.aborted) throw new Error('Settings projects load cancelled');
        const { projects } = await runtime.json('/api/config/settings', settingsSchema, { signal: controller.signal });
        if (lifetime.signal.aborted) throw new Error('Settings projects are unavailable');
        if (controller.signal.aborted) throw new Error('Settings projects load cancelled');
        // Read the current choice so a selection made during this load survives.
        const selectedId = projects.some(project => project.id === state.selectedId) ? state.selectedId : null;
        publish({ projects, selectedId, ready: true, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) publish({ loading: false, error: 'load' });
        throw error;
      }
    }).finally(() => { if (pending?.controller === controller) pending = null; });
    pending = { promise: request, controller };
    publish({ loading: true, error: null });
    return request;
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      if (!lifetime.signal.aborted) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getDirectory: () => lifetime.signal.aborted ? null : state.selectedId === null ? options.currentDirectory() : state.projects.find(project => project.id === state.selectedId)?.path ?? null,
    load,
    cancelLoad,
    select: (projectID: string | null): boolean => {
      if (lifetime.signal.aborted || projectID !== null && !state.projects.some(project => project.id === projectID)) return false;
      if (state.selectedId !== projectID) publish({ selectedId: projectID });
      return true;
    },
    dispose: () => { lifetime.abort(); pending?.controller.abort(); pending = null; listeners.clear(); },
  };
}

export type SettingsProjectsStore = ReturnType<typeof createSettingsProjectsStore>;
