import type { Draft } from './chat';
import type { Session } from './schema';

export type SessionRecovery = { sessionId: string; reason: 'missing' | 'unavailable' };

/** A root-list omission is not deletion evidence. The session endpoint owns that answer. */
export async function resolveSelectedSession(
  sessionId: string,
  sessions: Session[],
  lookup: (sessionId: string) => Promise<Session | null>,
): Promise<{ session: Session | null; recovery: SessionRecovery | null }> {
  const listed = sessions.find(session => session.id === sessionId);
  if (listed) return { session: listed, recovery: null };
  try {
    const session = await lookup(sessionId);
    if (session && session.id !== sessionId) throw new Error('Session identity mismatch');
    return { session, recovery: session ? null : { sessionId, reason: 'missing' } };
  } catch {
    return { session: null, recovery: { sessionId, reason: 'unavailable' } };
  }
}

export async function loadCompleteSessionList(
  readPage: (cursor: number | undefined) => Promise<{ sessions: Session[]; nextCursor: string | null }>,
  pageSize: number,
): Promise<Map<string, Session>> {
  const collected = new Map<string, Session>();
  let cursor: number | undefined;
  for (;;) {
    const page = await readPage(cursor);
    const previousSize = collected.size;
    for (const session of page.sessions) collected.set(session.id, session);
    if (page.sessions.length < pageSize) return collected;
    const next = page.nextCursor === null ? page.sessions.at(-1)?.time.updated : page.nextCursor.trim() ? Number(page.nextCursor) : NaN;
    if (next === undefined || !Number.isFinite(next) || cursor !== undefined && next >= cursor || collected.size === previousSize) {
      throw new Error('Session pagination did not complete');
    }
    cursor = next;
  }
}

export function sessionSendError(sessionId: string | null, sessions: Session[], recovery: SessionRecovery | null): 'sessionMissing' | 'load' | null {
  if (!sessionId) return null;
  if (recovery?.sessionId === sessionId) return recovery.reason === 'missing' ? 'sessionMissing' : 'load';
  return sessions.some(session => session.id === sessionId) ? null : 'load';
}

/** Copy into the created session without consuming either the old or the new-chat draft. */
export function recoveredDraftState(
  current: { activeId: string | null; drafts: { [sessionId: string]: Draft } },
  sourceId: string,
  createdId: string,
) {
  if (sourceId === createdId || current.drafts[createdId] !== undefined) return null;
  const draft = current.drafts[sourceId];
  return {
    activeId: current.activeId === sourceId ? createdId : current.activeId,
    drafts: draft ? { ...current.drafts, [createdId]: draft } : current.drafts,
  };
}
