import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import type { PermissionMode } from "@/lib/permissionModes"

const storage = new Map<string, string>()
const originalFetch = globalThis.fetch
globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
  if (String(input).includes('/api/fs/home')) {
    return Response.json({ home: '/home/test', dataDirectory: '/home/test/.config/ivaldi' })
  }
  return new Response(null, { status: 404 })
}, originalFetch)
afterAll(() => { globalThis.fetch = originalFetch })
const createSessionCalls: Array<{ title?: string; directory: string | null; parentID: string | null; metadata?: unknown }> = []
const savedVariantCalls: Array<string | undefined> = []
let configVariantOverride: string | null | undefined
const permissionModeCalls: Array<[string, PermissionMode]> = []
// Sync's session→directory index. `createSession` writes it, and directory
// resolution reads it as the authoritative source, so the mock has to keep one.
const sessionDirectoryRegistry = new Map<string, string>()
let createdSessionDirectory: string | undefined
let productMode: "work" | "developer" = "developer"

mock.module("zustand", () => ({
  create: () => (initializer: (
    set: (patch: unknown | ((state: unknown) => unknown)) => void,
    get: () => unknown,
    api?: unknown,
  ) => Record<string, unknown>) => {
    let state: Record<string, unknown>
    const get = () => state
    const set = (patch: unknown | ((current: Record<string, unknown>) => unknown)) => {
      const next = typeof patch === "function" ? patch(state) : patch
      state = next && typeof next === "object" ? { ...state, ...(next as Record<string, unknown>) } : state
    }

    state = initializer(set, get, {
      setState: set,
      getState: get,
      getInitialState: get,
      subscribe: () => () => undefined,
    } as never)

    const store = ((selector?: (current: Record<string, unknown>) => unknown) => (
      typeof selector === "function" ? selector(state) : state
    )) as unknown as {
      getState: () => Record<string, unknown>
      setState: (patch: unknown | ((current: Record<string, unknown>) => unknown)) => void
      subscribe: () => () => void
    }

    store.getState = () => state
    store.setState = (patch) => set(patch)
    store.subscribe = () => () => undefined

    return store
  },
}))

const deferredStorage: Storage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value)
  },
  removeItem: (key: string) => {
    storage.delete(key)
  },
  clear: () => {
    storage.clear()
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size
  },
}

mock.module("@/stores/utils/safeStorage", () => ({
  getDeferredSafeStorage: () => deferredStorage,
  createDeferredSafeJSONStorage: () => ({
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  }),
}))

mock.module("@/lib/opencode/client", () => ({
  opencodeClient: {
    getDirectory: () => null,
    getFilesystemHome: mock(async () => "/home/test"),
    createDirectory: mock(async (path: string) => ({ success: true, path })),
    setDirectory: mock(() => undefined),
  },
}))

mock.module("@/stores/permissionStore", () => ({
  usePermissionStore: {
    getState: () => ({
      setSessionMode: mock(async (sessionId: string, mode: PermissionMode) => {
        permissionModeCalls.push([sessionId, mode])
      }),
    }),
  },
}))

mock.module("@/stores/useProductModeStore", () => ({
  useProductModeStore: {
    getState: () => ({ mode: productMode }),
  },
}))

mock.module("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => ({
      currentAgentName: "agent-default",
      currentProviderId: "provider",
      currentModelId: "model",
      currentVariantSelection: { override: configVariantOverride, inherited: "high" },
      agents: [],
      activateDirectory: mock(async () => undefined),
      applyDefaultModelAgentSelection: mock(() => undefined),
    }),
  },
}))

mock.module("@/stores/useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({
      projects: [],
      activeProjectId: null,
      getActiveProject: () => null,
    }),
  },
}))

mock.module("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: {
    getState: () => ({
      currentDirectory: null,
      setDirectory: mock(() => undefined),
    }),
  },
}))

mock.module("@/stores/useGlobalSessionsStore", () => ({
  useGlobalSessionsStore: {
    getState: () => ({
      activeSessions: [],
      archivedSessions: [],
    }),
  },
  resolveGlobalSessionDirectory: () => null,
}))

mock.module("@/stores/useSessionFoldersStore", () => ({
  useSessionFoldersStore: {
    getState: () => ({
      addSessionToFolder: mock(() => undefined),
    }),
  },
}))

mock.module("@/stores/useCommandsStore", () => ({
  useCommandsStore: {
    getState: () => ({
      commands: [],
    }),
  },
}))

mock.module("@/stores/useSkillsStore", () => ({
  useSkillsStore: {
    getState: () => ({
      skills: [],
    }),
  },
}))

mock.module("@/components/ui", () => ({
  toast: {
    error: () => undefined,
    info: () => undefined,
    success: () => undefined,
  },
}))

mock.module("../selection-store", () => ({
  useSelectionStore: {
    getState: () => ({
      saveSessionModelSelection: () => undefined,
      saveSessionAgentSelection: () => undefined,
      saveAgentModelForSession: () => undefined,
      saveAgentModelVariantForSession: (_sessionId: string, _agent: string, _provider: string, _model: string, variant: string | undefined) => { savedVariantCalls.push(variant) },
      getSessionAgentSelection: () => null,
      getSessionModelSelection: () => null,
      getAgentModelForSession: () => null,
      getAgentModelVariantForSession: () => undefined,
    }),
  },
}))

mock.module("@/lib/runtime-switch", () => ({
  getRuntimeApiBaseUrl: () => "",
  getRuntimeKey: () => "test-runtime",
  initializeRuntimeEndpoint: () => undefined,
  subscribeRuntimeEndpointChanged: () => () => undefined,
  switchRuntimeEndpoint: () => undefined,
}))

mock.module("@/lib/userSendAnimation", () => ({
  markPendingUserSendAnimation: () => undefined,
}))

mock.module("../sync-context", () => ({
  setActiveSession: () => undefined,
}))

mock.module("../notification-store", () => ({
  markSessionViewed: () => undefined,
}))

mock.module("../session-navigation", () => ({
  setSessionOpener: () => undefined,
}))

mock.module("../session-worktree-contract", () => ({
  getAttachedSessionDirectory: () => null,
}))

mock.module("../session-worktree-store", () => ({
  useSessionWorktreeStore: {
    getState: () => ({
      getAttachment: () => undefined,
      setAttachment: () => undefined,
      clearAttachment: () => undefined,
    }),
  },
}))

mock.module("../viewport-store", () => ({
  getViewportSessionMemory: () => null,
  viewportSessionKey: (sessionId: string) => sessionId,
  useViewportStore: {
    getState: () => ({
      updateViewportAnchor: mock(() => undefined),
    }),
    setState: () => undefined,
  },
}))

mock.module("../input-store", () => ({
  useInputStore: {
    getState: () => ({
      clearAttachedFiles: () => undefined,
      setPendingInputText: () => undefined,
      addRestoredAttachment: () => undefined,
    }),
  },
}))

mock.module("../sync-refs", () => ({
  getDirectoryState: () => null,
  getSyncSessions: () => [],
  getSyncMessages: () => [],
  getSyncParts: () => [],
  getAllSyncSessions: () => [],
  getSyncSessionDirectory: (sessionId: string) => sessionDirectoryRegistry.get(sessionId) ?? null,
  registerSessionDirectory: (sessionId: string, directory: string) => {
    sessionDirectoryRegistry.set(sessionId, directory)
  },
}))

mock.module("../session-actions", () => ({
  // Mirrors the real action's authoritative steps: the created session becomes
  // current under the directory the server confirmed, and that directory enters
  // the routing index. Everything these tests assert about routing depends on
  // those two, so a mock without them tests nothing.
  createSession: mock(async (
    title: string | undefined,
    directory: string | null,
    parentID: string | null,
    metadata?: unknown,
    selectionTransition?: "submitted-draft",
  ) => {
    createSessionCalls.push({ title, directory, parentID, metadata })
    const session = { id: "ses_issue_2039", directory: createdSessionDirectory ?? directory }
    const sessionDirectory = session.directory ?? null
    if (sessionDirectory) {
      sessionDirectoryRegistry.set(session.id, sessionDirectory)
    }
    const { useSessionUIStore: store } = await import("../session-ui-store")
    store.getState().setCurrentSession(session.id, sessionDirectory, selectionTransition)
    store.getState().markSessionAsOpenChamberCreated(session.id)
    return session
  }),
  deleteSession: mock(async () => true),
  deleteSessions: mock(async () => ({ deletedIds: [], failedIds: [] })),
  archiveSession: mock(async () => true),
  archiveSessions: mock(async () => ({ archivedIds: [], failedIds: [] })),
  unarchiveSession: mock(async () => true),
  unarchiveSessions: mock(async () => ({ restoredIds: [], failedIds: [] })),
  updateSessionTitle: mock(async () => undefined),
  shareSession: mock(async () => undefined),
  unshareSession: mock(async () => undefined),
  optimisticSend: mock(async () => undefined),
  refetchSessionMessages: mock(async () => undefined),
  revertToMessage: mock(async () => undefined),
  unrevertSession: mock(async () => undefined),
  forkFromMessage: mock(async () => undefined),
  fetchMessagesForSession: mock(async () => undefined),
  getSessionLastAssistantModel: () => null,
  patchSessionMetadata: mock(async () => undefined),
  abortCurrentOperation: mock(async () => undefined),
}))

const { materializeOpenDraftSession, useSessionUIStore } = await import("../session-ui-store")

describe("issue 2039 draft permission mode", () => {
  beforeEach(() => {
    storage.clear()
    createSessionCalls.length = 0
    sessionDirectoryRegistry.clear()
    permissionModeCalls.length = 0
    savedVariantCalls.length = 0
    configVariantOverride = undefined
    createdSessionDirectory = undefined
    productMode = "developer"

    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: {
        draftId: 0,
        open: false,
        directoryOverride: null,
        parentID: null,
        target: "chat",
      },
    })
  })

  test("stores the selected permission mode in the draft and applies it before materialization returns", async () => {
    useSessionUIStore.getState().openNewSessionDraft()

    expect(useSessionUIStore.getState().newSessionDraft.permissionMode).toBe("manual")

    useSessionUIStore.getState().setDraftPermissionMode("full-access")

    expect(useSessionUIStore.getState().newSessionDraft.permissionMode).toBe("full-access")

    const result = await materializeOpenDraftSession({
      providerID: "provider",
      modelID: "model",
    })
    expect(result?.sessionId).toBe("ses_issue_2039")
    expect(createSessionCalls).toHaveLength(1)
    expect(permissionModeCalls).toEqual([["ses_issue_2039", "full-access"]])
    expect(useSessionUIStore.getState().currentSessionId).toBe("ses_issue_2039")
  })

  test("stores only an explicit draft variant as the session override", async () => {
    useSessionUIStore.getState().openNewSessionDraft()
    await materializeOpenDraftSession({
      providerID: "provider",
      modelID: "model",
      agent: "agent-default",
      variant: "high",
    })

    expect(savedVariantCalls).toEqual([undefined])

    configVariantOverride = "high"
    useSessionUIStore.getState().openNewSessionDraft()
    await materializeOpenDraftSession({
      providerID: "provider",
      modelID: "model",
      agent: "agent-default",
      variant: "high",
    })

    expect(savedVariantCalls).toEqual([undefined, "high"])
  })

  test("defaults Work mode drafts to full access", () => {
    productMode = "work"
    useSessionUIStore.getState().openNewSessionDraft()

    expect(useSessionUIStore.getState().newSessionDraft.permissionMode).toBe("full-access")
  })

  test("does not apply a draft permission mode after the draft is closed", async () => {
    useSessionUIStore.getState().openNewSessionDraft()
    useSessionUIStore.getState().setDraftPermissionMode("full-access")
    useSessionUIStore.getState().closeNewSessionDraft()

    expect(useSessionUIStore.getState().newSessionDraft.open).toBe(false)
    expect(useSessionUIStore.getState().newSessionDraft.permissionMode === undefined).toBe(true)

    const result = await materializeOpenDraftSession({
      providerID: "provider",
      modelID: "model",
    })

    expect(result).toBeNull()
    expect(createSessionCalls).toHaveLength(0)
    expect(permissionModeCalls).toHaveLength(0)
  })

  test("transfers draft project context pins only to the session it creates", async () => {
    useSessionUIStore.getState().openNewSessionDraft({
      projectContextPins: { notes: ["note-a"], plans: [] },
    })
    useSessionUIStore.getState().setDraftProjectContextPin("plan", "plan-a", true)

    await materializeOpenDraftSession({ providerID: "provider", modelID: "model" })

    expect(createSessionCalls[0]?.metadata).toEqual({
      openchamber: {
        project_context_pins: { notes: ["note-a"], plans: ["plan-a"] },
      },
    })
    expect(useSessionUIStore.getState().newSessionDraft.projectContextPins).toBe(undefined)

    useSessionUIStore.getState().openNewSessionDraft()
    await materializeOpenDraftSession({ providerID: "provider", modelID: "model" })

    expect(createSessionCalls[1]?.metadata).toBe(undefined)
  })

  test("uses the server-authoritative directory after worktree session creation", async () => {
    createdSessionDirectory = "/canonical/worktree"
    useSessionUIStore.getState().openNewSessionDraft({
      directoryOverride: "/requested/worktree",
    })

    const result = await materializeOpenDraftSession({
      providerID: "provider",
      modelID: "model",
    })

    expect(createSessionCalls[0]?.directory).toBe("/requested/worktree")
    expect(result?.directory).toBe("/canonical/worktree")
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe("/canonical/worktree")
  })

  test("routes the session by the canonical directory, not the requested worktree path", async () => {
    createdSessionDirectory = "/canonical/worktree"
    useSessionUIStore.getState().openNewSessionDraft({
      directoryOverride: "/requested/worktree",
    })

    const created = await materializeOpenDraftSession({
      providerID: "provider",
      modelID: "model",
    })
    const sessionId = created?.sessionId ?? ""

    // The worktree attachment still holds the path this client asked for. The
    // directory every send, queue key, and confirmation lookup is routed by
    // must be the canonical one the server returned.
    useSessionUIStore.getState().setWorktreeMetadata(sessionId, {
      path: "/requested/worktree",
      projectDirectory: "/repo",
      branch: "feature",
      label: "feature",
    })

    expect(useSessionUIStore.getState().getDirectoryForSession(sessionId)).toBe("/canonical/worktree")
  })
})
