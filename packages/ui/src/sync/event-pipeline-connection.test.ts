import { afterEach, describe, expect, test } from "bun:test"
import { createOpencodeClient, type Event, type GlobalEvent, type OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { createEventPipeline } from "./event-pipeline"

// These tests drive the pipeline through the real SDK SSE client with a fake
// fetch, so they cover how the SDK actually opens, fails, and ends a stream.

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

type SseServer = {
  response: Response
  send: (frame: string) => void
}

function openSseResponse(): SseServer {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
    },
  })
  const encoder = new TextEncoder()
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    send: (frame) => controller?.enqueue(encoder.encode(frame)),
  }
}

function sdkWithFetch(fetchImpl: typeof fetch): OpencodeClient {
  return createOpencodeClient({ baseUrl: "http://127.0.0.1:4096", fetch: fetchImpl })
}

const serverConnectedFrame = `data: ${JSON.stringify({ directory: "global", payload: { type: "server.connected", properties: {} } })}\n\n`

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitFor(condition: () => boolean, timeoutMs: number, message: string): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(message)
    await sleep(5)
  }
}

describe("createEventPipeline SSE connection state", () => {
  test("reports connected only after the first frame arrives", async () => {
    let server: SseServer | undefined
    const sdk = sdkWithFetch(async () => {
      server = openSseResponse()
      return server.response
    })
    let reconnects = 0
    const pipeline = createEventPipeline({
      sdk,
      transport: "sse",
      onEvents: () => {},
      onReconnect: () => {
        reconnects += 1
      },
    })

    try {
      await waitFor(() => server !== undefined, 1_000, "SSE request was never sent")
      // The response is open but nothing has arrived yet.
      await sleep(50)
      expect(reconnects).toBe(0)

      server?.send(serverConnectedFrame)
      await waitFor(() => reconnects > 0, 1_000, "first frame did not mark the stream connected")
      expect(reconnects).toBe(1)
    } finally {
      pipeline.cleanup()
    }
  })

  test("surfaces a 401 as a disconnect and does not retry in a tight loop", async () => {
    let requests = 0
    const sdk = sdkWithFetch(async () => {
      requests += 1
      return new Response("unauthorized", { status: 401, statusText: "Unauthorized" })
    })
    let reconnects = 0
    const disconnectReasons: string[] = []
    const originalConsoleError = console.error
    console.error = () => {}
    const pipeline = createEventPipeline({
      sdk,
      transport: "sse",
      onEvents: () => {},
      onReconnect: () => {
        reconnects += 1
      },
      onDisconnect: (reason) => {
        disconnectReasons.push(reason)
      },
    })

    try {
      await waitFor(() => disconnectReasons.length > 0, 1_000, "401 was never reported as a disconnect")
      // Permanent 4xx failures wait on the long backoff cap.
      await sleep(400)
      expect(disconnectReasons).toEqual(["sse_http_401"])
      expect(reconnects).toBe(0)
      expect(requests).toBe(1)
    } finally {
      pipeline.cleanup()
      console.error = originalConsoleError
    }
  })

  test("backs off with growing delays while the server stays unreachable", async () => {
    const requestTimes: number[] = []
    const sdk = sdkWithFetch(async () => {
      requestTimes.push(Date.now())
      throw new TypeError("Failed to fetch")
    })
    let reconnects = 0
    const disconnectReasons: string[] = []
    const originalConsoleError = console.error
    console.error = () => {}
    const pipeline = createEventPipeline({
      sdk,
      transport: "sse",
      onEvents: () => {},
      onReconnect: () => {
        reconnects += 1
      },
      onDisconnect: (reason) => {
        disconnectReasons.push(reason)
      },
    })

    try {
      await waitFor(() => requestTimes.length >= 3, 3_000, "pipeline stopped retrying")
      const firstGap = requestTimes[1] - requestTimes[0]
      const secondGap = requestTimes[2] - requestTimes[1]
      expect(firstGap).toBeGreaterThanOrEqual(200)
      expect(secondGap).toBeGreaterThan(firstGap * 1.5)
      expect(reconnects).toBe(0)
      // The disconnect is reported once per outage, not once per attempt.
      expect(disconnectReasons).toEqual(["sse_error:Failed to fetch"])
    } finally {
      pipeline.cleanup()
      console.error = originalConsoleError
    }
  })

  test("treats a stream that closes before any frame as a failed attempt", async () => {
    const requestTimes: number[] = []
    const sdk = sdkWithFetch(async () => {
      requestTimes.push(Date.now())
      return new Response("", { status: 200, headers: { "content-type": "text/event-stream" } })
    })
    let reconnects = 0
    const disconnectReasons: string[] = []
    const originalConsoleError = console.error
    console.error = () => {}
    const pipeline = createEventPipeline({
      sdk,
      transport: "sse",
      onEvents: () => {},
      onReconnect: () => {
        reconnects += 1
      },
      onDisconnect: (reason) => {
        disconnectReasons.push(reason)
      },
    })

    try {
      await waitFor(() => requestTimes.length >= 3, 3_000, "pipeline stopped retrying")
      expect(requestTimes[2] - requestTimes[1]).toBeGreaterThan(requestTimes[1] - requestTimes[0])
      expect(reconnects).toBe(0)
      expect(disconnectReasons).toEqual(["sse_stream_ended"])
    } finally {
      pipeline.cleanup()
      console.error = originalConsoleError
    }
  })

  test("reports a WS to SSE transport switch only once SSE delivers data", async () => {
    // The WS attempt first mints a URL auth token. Failing that request makes
    // auto mode fall back to SSE without opening a socket.
    globalThis.fetch = async () => new Response(null, { status: 503 })
    let server: SseServer | undefined
    const sdk = sdkWithFetch(async () => {
      server = openSseResponse()
      return server.response
    })
    let reconnects = 0
    let transportSwitches = 0
    const pipeline = createEventPipeline({
      sdk,
      transport: "auto",
      onEvents: () => {},
      onReconnect: () => {
        reconnects += 1
      },
      onTransportSwitch: () => {
        transportSwitches += 1
      },
    })

    try {
      await waitFor(() => server !== undefined, 1_000, "SSE fallback request was never sent")
      await sleep(50)
      expect(transportSwitches).toBe(0)
      expect(reconnects).toBe(0)

      server?.send(serverConnectedFrame)
      await waitFor(() => transportSwitches > 0, 1_000, "transport switch was never reported")
      expect(reconnects).toBe(1)
      expect(transportSwitches).toBe(1)
    } finally {
      pipeline.cleanup()
    }
  })
})

describe("createEventPipeline teardown", () => {
  test("drops queued and late events instead of delivering them after cleanup", async () => {
    let markQueued: () => void = () => {}
    const queued = new Promise<void>((resolve) => {
      markQueued = resolve
    })
    let releaseLateEvent: () => void = () => {}
    const lateEventReleased = new Promise<void>((resolve) => {
      releaseLateEvent = resolve
    })
    const statusEvent = (sessionID: string): GlobalEvent => ({
      directory: "/repo",
      payload: {
        id: `evt-${sessionID}`,
        type: "session.status",
        properties: { sessionID, status: { type: "busy" } },
      },
    })
    // A scripted stream keeps the timing deterministic: the generator resumes
    // only after the pipeline has queued the event it yielded.
    const sdk = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096" })
    sdk.global.event = async () => ({
      stream: (async function* () {
        yield statusEvent("ses_queued")
        markQueued()
        await lateEventReleased
        yield statusEvent("ses_late")
      })(),
    })
    const delivered: Event[] = []
    const pipeline = createEventPipeline({
      sdk,
      transport: "sse",
      onEvents: (_directory, payloads) => {
        delivered.push(...payloads)
      },
    })

    await queued
    // The event sits in the 33ms flush window when the runtime unmounts.
    pipeline.cleanup()
    releaseLateEvent()
    await sleep(80)

    expect(delivered).toEqual([])
  })
})
