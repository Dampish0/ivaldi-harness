import { describe, expect, test } from "bun:test"

import { createServerAnswerWaits, willServerApprovePermission } from "./permission-server-answer"

const createFakeTimers = () => {
  const scheduled = new Map<number, () => void>()
  let next = 0
  return {
    scheduled,
    set: (callback: () => void) => {
      next += 1
      scheduled.set(next, callback)
      return next
    },
    clear: (handle: number) => {
      scheduled.delete(handle)
    },
    fireAll: () => {
      const callbacks = [...scheduled.values()]
      scheduled.clear()
      for (const callback of callbacks) callback()
    },
  }
}

describe("willServerApprovePermission", () => {
  const edit = { permission: "edit", patterns: ["src/app.ts"] }
  const secretEdit = { permission: "edit", patterns: [".env"] }
  const removal = { permission: "bash", patterns: ["rm -rf build"] }

  test("Manual leaves every request to the user", () => {
    expect(willServerApprovePermission("manual", edit, "/repo")).toBe(false)
  })

  test("Full access approves every request", () => {
    expect(willServerApprovePermission("full-access", removal, "/repo")).toBe(true)
  })

  test("Auto approves only what its classifier allows", () => {
    expect(willServerApprovePermission("auto", edit, "/repo")).toBe(true)
    expect(willServerApprovePermission("auto", secretEdit, "/repo")).toBe(false)
    expect(willServerApprovePermission("auto", removal, "/repo")).toBe(false)
  })
})

describe("createServerAnswerWaits", () => {
  test("shows a request the server did not answer in time", () => {
    const timers = createFakeTimers()
    const waits = createServerAnswerWaits(timers)
    const shown: string[] = []

    waits.wait("a", () => shown.push("a"))
    waits.wait("b", () => shown.push("b"))
    waits.answered("a")
    timers.fireAll()

    expect(shown).toEqual(["b"])
  })

  test("keeps one timer per request", () => {
    const timers = createFakeTimers()
    const waits = createServerAnswerWaits(timers)
    const shown: string[] = []

    waits.wait("a", () => shown.push("first"))
    waits.wait("a", () => shown.push("second"))
    expect(timers.scheduled.size).toBe(1)
    timers.fireAll()

    expect(shown).toEqual(["second"])
    waits.answered("a")
  })
})
