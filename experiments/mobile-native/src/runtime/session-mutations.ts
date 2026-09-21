import type { Session } from './schema';

type SessionPatch = { title: string } | { time: { archived: number } };
export type SessionMutationResult = 'saved' | 'failed' | 'unavailable' | 'busy';
type SessionMutationIO = {
  session: (id: string) => Session | undefined;
  update: (id: string, directory: string, patch: SessionPatch) => Promise<Session>;
  commit: (session: Session) => void;
};

function matchesPatch(session: Session, patch: SessionPatch) {
  return 'title' in patch ? session.title === patch.title : Boolean(session.time.archived) === Boolean(patch.time.archived);
}

/** Session identity and write lifetime belong to the runtime, independently of navigation. */
export class SessionMutations {
  private readonly pending = new Set<string>();
  private disposed = false;
  private readonly io: SessionMutationIO;

  constructor(io: SessionMutationIO) { this.io = io; }

  rename(id: string, title: string): Promise<SessionMutationResult> {
    return title.trim() ? this.change(id, { title: title.trim() }) : Promise.resolve('failed');
  }

  archive(id: string, archived: boolean): Promise<SessionMutationResult> {
    return this.change(id, { time: { archived: archived ? Date.now() : 0 } });
  }

  private async change(id: string, patch: SessionPatch): Promise<SessionMutationResult> {
    if (this.disposed) return 'unavailable';
    if (this.pending.has(id)) return 'busy';
    const original = this.io.session(id);
    if (!original) return 'unavailable';
    if (matchesPatch(original, patch)) return 'saved';
    this.pending.add(id);
    try {
      const updated = await this.io.update(id, original.directory, patch);
      if (this.disposed) return 'unavailable';
      if (updated.id !== id || updated.directory !== original.directory) return 'failed';
      const current = this.io.session(id);
      if (!current || current.directory !== original.directory) return 'unavailable';
      // A later server event wins over an older HTTP response. Feed the
      // accepted record through the runtime's list reconciliation as well.
      this.io.commit(current.time.updated > updated.time.updated ? current : updated);
      return 'saved';
    } catch {
      if (this.disposed) return 'unavailable';
      const current = this.io.session(id);
      if (!current || current.directory !== original.directory) return 'unavailable';
      // The event stream can confirm an idempotent change even when the HTTP
      // response was lost. The visible authoritative result is sufficient.
      if (matchesPatch(current, patch)) { this.io.commit(current); return 'saved'; }
      return 'failed';
    } finally {
      this.pending.delete(id);
    }
  }

  dispose() { this.disposed = true; }
}
