import { classifyAutoPermission } from "@/lib/permissionAutoPolicy"
import type { PermissionMode } from "@/lib/permissionModes"
import type { PermissionRequest } from "@/types/permission"

// How long a request the server should approve stays hidden before the UI
// shows it anyway. The server normally answers well within this.
const SERVER_ANSWER_GRACE_MS = 4000

// The server approves every request in Full access, and the routine ones in
// Auto. It runs the same classifier, so the UI can tell in advance which
// requests it will answer and skip their cards and toasts.
export const willServerApprovePermission = (
  mode: PermissionMode,
  request: Pick<PermissionRequest, "permission" | "patterns">,
  directory: string,
): boolean => {
  if (mode === "full-access") return true
  if (mode !== "auto") return false
  return classifyAutoPermission({ permission: request.permission, patterns: request.patterns, directory }).effect === "allow"
}

type Timers<Handle> = {
  set: (callback: () => void, delayMs: number) => Handle
  clear: (handle: Handle) => void
}

// Tracks hidden requests until the server answers them. A request still
// unanswered after the grace period is handed back to be shown, so a stopped
// or disagreeing server can never leave a session waiting on a hidden prompt.
export function createServerAnswerWaits<Handle>(timers: Timers<Handle>, graceMs = SERVER_ANSWER_GRACE_MS) {
  const pending = new Map<string, Handle>()

  const answered = (key: string) => {
    const handle = pending.get(key)
    if (handle === undefined) return
    timers.clear(handle)
    pending.delete(key)
  }

  const wait = (key: string, onUnanswered: () => void) => {
    answered(key)
    pending.set(key, timers.set(() => {
      pending.delete(key)
      onUnanswered()
    }, graceMs))
  }

  return { wait, answered }
}
