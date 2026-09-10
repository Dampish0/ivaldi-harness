import { z } from 'zod';

const sessionSchema = z.object({
  id: z.string().min(1),
  directory: z.string().min(1),
  parentID: z.string().optional(),
  time: z.object({ updated: z.number().finite(), archived: z.number().optional() }),
  metadata: z.json().optional(),
});
const pageSchema = z.array(z.json());
const PAGE_SIZE = 200;

// Discovery runs once per stream connection. Only incomplete scans retry;
// normal goal progress continues through the shared stream and idle timers.
export const createSessionGoalRecovery = ({
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  onSession,
  onConnect,
  onDisconnect,
}) => {
  let unsubscribe;
  let controller;
  let retryTimer;
  let retryMs = 1_000;

  const scan = async (signal) => {
    let cursor;
    let malformed = false;
    const seen = new Set();
    while (!signal.aborted) {
      // Include archived rows because OpenCode also stores unarchived rows
      // with archived=0. Filter actual archives below.
      const query = new URLSearchParams({ roots: 'true', archived: 'true', limit: String(PAGE_SIZE) });
      if (cursor !== undefined) query.set('cursor', String(cursor));
      const response = await fetch(`${buildOpenCodeUrl('/experimental/session', '')}?${query}`, {
        headers: { Accept: 'application/json', ...getOpenCodeAuthHeaders() },
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) throw new Error(`Goal discovery failed with ${response.status}`);
      const page = pageSchema.parse(await response.json());
      signal.throwIfAborted();
      let lastUpdated;
      for (const row of page) {
        const result = sessionSchema.safeParse(row);
        if (!result.success) {
          malformed = true;
          continue;
        }
        const session = result.data;
        lastUpdated = session.time.updated;
        if (seen.has(session.id)) continue;
        seen.add(session.id);
        if (!session.parentID && !session.time.archived) onSession(session);
      }
      if (page.length < PAGE_SIZE) break;
      const header = response.headers.get('x-next-cursor');
      const next = header === null ? lastUpdated : Number(header);
      if (!Number.isFinite(next) || (cursor !== undefined && next >= cursor)) {
        throw new Error('Goal discovery returned a non-advancing cursor');
      }
      cursor = next;
    }
    if (malformed) throw new Error('Goal discovery contained invalid session records');
  };

  const recover = async (signal) => {
    try {
      await scan(signal);
      retryMs = 1_000;
    } catch (error) {
      if (signal.aborted) return;
      console.warn('[session-goal] recovery incomplete:', error.message);
      retryTimer = setTimeout(() => void recover(signal), retryMs);
      retryTimer.unref?.();
      retryMs = Math.min(retryMs * 2, 60_000);
    }
  };

  const disconnect = () => {
    controller?.abort();
    controller = undefined;
    clearTimeout(retryTimer);
    onDisconnect();
  };

  const connect = () => {
    if (controller) return;
    controller = new AbortController();
    retryMs = 1_000;
    onConnect();
    void recover(controller.signal);
  };

  return {
    start(hub) {
      if (unsubscribe) return;
      unsubscribe = hub.subscribeStatus((status) => {
        if (status.type === 'connect') connect();
        else disconnect();
      });
      if (hub.isConnected()) connect();
      else disconnect();
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      disconnect();
    },
  };
};
