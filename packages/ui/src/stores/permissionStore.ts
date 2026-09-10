import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import type { PermissionAutoAcceptMap } from "./utils/permissionAutoAccept";
import { getAllSyncSessionMap } from "@/sync/sync-refs";
import { runtimeFetch } from "@/lib/runtime-fetch";
import { isVSCodeRuntime } from "@/lib/desktop";
import { createDeferredSafeJSONStorage } from "./utils/safeStorage";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { opencodeClient } from "@/lib/opencode/client";
import { getRuntimeKey } from "@/lib/runtime-switch";
import {
    DEFAULT_PERMISSION_MODE_CAPABILITIES,
    isPermissionModeSupported,
    permissionModeFromLegacyAutoAccept,
    permissionPolicySnapshotSchema,
    type PermissionMode,
    type PermissionModeCapabilities,
    type PermissionPolicySnapshot as ParsedPermissionPolicySnapshot,
} from "@/lib/permissionModes";

type PermissionStoreSnapshot = {
    sessions: PermissionAutoAcceptMap;
    modes?: Record<string, PermissionMode>;
    revision?: number;
    capabilities?: PermissionModeCapabilities;
};

const legacyPermissionSnapshotSchema = z.object({
    sessions: z.record(z.string(), z.boolean()),
    revision: z.number().int().nonnegative().optional(),
}).strict();

const persistedPermissionStoreSchema = z.object({
    autoAccept: z.record(z.string(), z.boolean()).optional(),
    legacyCandidate: z.record(z.string(), z.boolean()).nullable().optional(),
    legacyRuntimeKey: z.string().nullable().optional(),
}).passthrough();

class PermissionHttpError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "PermissionHttpError";
        this.status = status;
    }
}

interface PermissionStore {
    autoAccept: PermissionAutoAcceptMap;
    modes: Record<string, PermissionMode>;
    capabilities: PermissionModeCapabilities;
    loaded: boolean;
    saving: boolean;
    lastAppliedRevision: number;
    legacyCandidate: PermissionAutoAcceptMap | null;
    legacyRuntimeKey: string | null;
    hydrate: () => Promise<void>;
    applySnapshot: (snapshot: PermissionStoreSnapshot, expectedRuntimeKey?: string) => void;
    reset: () => void;
    getSessionMode: (sessionId: string) => PermissionMode;
    isModeSupported: (mode: PermissionMode) => boolean;
    isSessionAutoAccepting: (sessionId: string) => boolean;
    setSessionMode: (sessionId: string, mode: PermissionMode) => Promise<void>;
    setSessionAutoAccept: (sessionId: string, enabled: boolean) => Promise<void>;
}

const readSnapshot = async (response: Response): Promise<PermissionStoreSnapshot> => {
    if (!response.ok) {
        throw new PermissionHttpError(`Permission auto-accept request failed (${response.status})`, response.status);
    }
    return legacyPermissionSnapshotSchema.parse(await response.json());
};

const requestSnapshot = async (path: string, init?: RequestInit) => readSnapshot(await runtimeFetch(path, init));

const readModeSnapshot = async (response: Response): Promise<ParsedPermissionPolicySnapshot> => {
    if (!response.ok) {
        throw new PermissionHttpError(`Permission policy request failed (${response.status})`, response.status);
    }
    return permissionPolicySnapshotSchema.parse(await response.json());
};

const requestModeSnapshot = async (path: string, init?: RequestInit): Promise<ParsedPermissionPolicySnapshot> => (
    readModeSnapshot(await runtimeFetch(path, init))
);

type PermissionOperation = { generation: number; runtimeKey: string; sequence: number };
let generation = 0;
let operationSequence = 0;
let latestStartedSequence = 0;
const pendingSavingOperations = new Set<number>();

const beginOperation = (): PermissionOperation => {
    const operation = { generation, runtimeKey: getRuntimeKey(), sequence: ++operationSequence };
    latestStartedSequence = operation.sequence;
    return operation;
};

const isCurrentOperation = (operation: PermissionOperation) => (
    operation.generation === generation && operation.runtimeKey === getRuntimeKey()
);

export const usePermissionStore = create<PermissionStore>()(persist((set, get) => ({
    autoAccept: {},
    modes: {},
    capabilities: DEFAULT_PERMISSION_MODE_CAPABILITIES,
    loaded: false,
    saving: false,
    lastAppliedRevision: -1,
    legacyCandidate: null,
    legacyRuntimeKey: null,

    hydrate: async () => {
        const operation = beginOperation();
        const legacyCandidate = get().legacyCandidate;
        let legacyRuntimeKey = get().legacyRuntimeKey;
        if (legacyCandidate && !legacyRuntimeKey) {
            legacyRuntimeKey = operation.runtimeKey;
            set({ legacyRuntimeKey });
        }
        let snapshot: PermissionStoreSnapshot;
        try {
            snapshot = await requestModeSnapshot("/api/permission-policy");
        } catch (error) {
            if (!(error instanceof PermissionHttpError) || error.status !== 404) throw error;
            const legacy = await requestSnapshot("/api/permission-auto-accept");
            snapshot = {
                ...legacy,
                modes: Object.fromEntries(
                    Object.entries(legacy.sessions).map(([sessionId, enabled]) => [
                        sessionId,
                        permissionModeFromLegacyAutoAccept(enabled),
                    ]),
                ),
                capabilities: DEFAULT_PERMISSION_MODE_CAPABILITIES,
            };
        }
        if (!isCurrentOperation(operation)) return;
        const legacyEntries = legacyRuntimeKey === operation.runtimeKey
            ? Object.entries(legacyCandidate ?? {})
            : [];
        if (Object.keys(snapshot.sessions).length === 0 && legacyEntries.length > 0) {
            for (const [sessionId, enabled] of legacyEntries) {
                if (!sessionId) continue;
                const legacySnapshot = await requestSnapshot(
                    `/api/permission-auto-accept/sessions/${encodeURIComponent(sessionId)}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ enabled }),
                    },
                );
                snapshot = {
                    ...legacySnapshot,
                    modes: Object.fromEntries(
                        Object.entries(legacySnapshot.sessions).map(([id, legacyEnabled]) => [
                            id,
                            permissionModeFromLegacyAutoAccept(legacyEnabled),
                        ]),
                    ),
                    capabilities: DEFAULT_PERMISSION_MODE_CAPABILITIES,
                };
                if (!isCurrentOperation(operation)) return;
            }
        }
        if (!isCurrentOperation(operation)) return;
        if (snapshot.revision === undefined && operation.sequence !== latestStartedSequence) return;
        get().applySnapshot(snapshot, operation.runtimeKey);
        if (legacyRuntimeKey === operation.runtimeKey) {
            set({ legacyCandidate: null, legacyRuntimeKey: null });
        }
    },

    reset: () => {
        generation += 1;
        latestStartedSequence = 0;
        pendingSavingOperations.clear();
        set({
            autoAccept: {},
            modes: {},
            capabilities: DEFAULT_PERMISSION_MODE_CAPABILITIES,
            loaded: false,
            saving: false,
            lastAppliedRevision: -1,
        });
    },

    applySnapshot: (snapshot, expectedRuntimeKey) => {
        if (expectedRuntimeKey && expectedRuntimeKey !== getRuntimeKey()) return;
        const sessions = { ...snapshot.sessions };
        const modes = snapshot.modes
            ? { ...snapshot.modes }
            : Object.fromEntries(
                Object.entries(sessions).map(([sessionId, enabled]) => [
                    sessionId,
                    permissionModeFromLegacyAutoAccept(enabled),
                ]),
            );
        const revision = snapshot.revision;
        set((state) => {
            if (revision === undefined && state.lastAppliedRevision >= 0) return state;
            if (revision !== undefined && revision < state.lastAppliedRevision) return state;
            const next = {
                autoAccept: sessions,
                modes,
                capabilities: snapshot.capabilities ?? state.capabilities,
                loaded: true,
                lastAppliedRevision: state.lastAppliedRevision,
            };
            if (revision !== undefined) next.lastAppliedRevision = revision;
            return next;
        });
    },

    getSessionMode: (sessionId) => {
        if (!sessionId) return "manual";
        const modes = get().modes;
        const sessionById = getAllSyncSessionMap();
        const seen = new Set<string>();
        let current: string | undefined = sessionId;
        while (current && !seen.has(current)) {
            if (Object.hasOwn(modes, current)) return modes[current];
            seen.add(current);
            current = sessionById.get(current)?.parentID;
        }
        return "manual";
    },

    isModeSupported: (mode) => isPermissionModeSupported(mode, get().capabilities),

    isSessionAutoAccepting: (sessionId) => {
        const mode = get().getSessionMode(sessionId);
        return mode === "full-access";
    },

    setSessionMode: async (sessionId, mode) => {
        if (!sessionId) return;
        const operation = beginOperation();
        pendingSavingOperations.add(operation.sequence);
        set({ saving: true });
        try {
            const directory = useSessionUIStore.getState().getDirectoryForSession(sessionId)
                ?? opencodeClient.getDirectory()
                ?? undefined;
            let snapshot: PermissionStoreSnapshot;
            try {
                snapshot = await requestModeSnapshot(
                    `/api/permission-policy/sessions/${encodeURIComponent(sessionId)}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ mode, directory }),
                    },
                );
            } catch (error) {
                if (!(error instanceof PermissionHttpError) || error.status !== 404 || (mode !== "manual" && mode !== "full-access")) {
                    throw error;
                }
                const legacy = await requestSnapshot(
                    `/api/permission-auto-accept/sessions/${encodeURIComponent(sessionId)}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ enabled: mode === "full-access", directory }),
                    },
                );
                snapshot = {
                    ...legacy,
                    modes: Object.fromEntries(
                        Object.entries(legacy.sessions).map(([id, enabled]) => [
                            id,
                            permissionModeFromLegacyAutoAccept(enabled),
                        ]),
                    ),
                    capabilities: DEFAULT_PERMISSION_MODE_CAPABILITIES,
                };
            }
            if (!isCurrentOperation(operation)) return;
            if (snapshot.revision === undefined && operation.sequence !== latestStartedSequence) return;
            get().applySnapshot(snapshot, operation.runtimeKey);
            if (isCurrentOperation(operation) && isVSCodeRuntime() && mode !== "manual") {
                const { reconcileVSCodePendingPermissions } = await import("@/sync/vscode-permission-auto-accept");
                if (isCurrentOperation(operation)) {
                    void reconcileVSCodePendingPermissions(directory).catch(() => undefined);
                }
            }
        } finally {
            if (isCurrentOperation(operation)) {
                pendingSavingOperations.delete(operation.sequence);
                set({ saving: pendingSavingOperations.size > 0 });
            }
        }
    },

    setSessionAutoAccept: async (sessionId, enabled) => {
        await get().setSessionMode(sessionId, permissionModeFromLegacyAutoAccept(enabled));
    },

}), {
    name: "permission-store",
    storage: createDeferredSafeJSONStorage(),
    version: 2,
    migrate: (persisted, version) => {
        const parsed = persistedPermissionStoreSchema.safeParse(persisted);
        const state = parsed.success ? parsed.data : {};
        if (version < 2) {
            const legacyCandidate = state.autoAccept ?? {};
            return {
                legacyCandidate: Object.keys(legacyCandidate).length > 0 ? legacyCandidate : null,
                legacyRuntimeKey: null,
            };
        }
        return {
            legacyCandidate: state.legacyCandidate ?? null,
            legacyRuntimeKey: state.legacyRuntimeKey ?? null,
        };
    },
    partialize: (state) => ({
        legacyCandidate: state.legacyCandidate,
        legacyRuntimeKey: state.legacyRuntimeKey,
    }),
}));
