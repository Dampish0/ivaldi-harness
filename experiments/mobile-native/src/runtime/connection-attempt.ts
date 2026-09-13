interface PreparedConnection {
  connection: { id: string };
  close(): void;
}

/** Preparation may save issued credentials, but only the current attempt activates them. */
export class ConnectionAttempts<Runtime extends PreparedConnection> {
  private status: 'idle' | 'preparing' | 'activating' = 'idle';
  private current: symbol | null = null;
  private pendingLink: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly activate: (id: string) => Promise<void>;

  constructor(activate: (id: string) => Promise<void>) { this.activate = activate; }
  getSnapshot = () => this.status;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(status: typeof this.status) { this.status = status; this.listeners.forEach(listener => listener()); }

  cancel = (): boolean => {
    // AsyncStorage cannot cancel an active write. Keep navigation locked only
    // for this short commit, never for network preparation or pairing requests.
    if (this.status === 'activating') return false;
    this.current = null;
    this.publish('idle');
    return true;
  };

  replaceWithLink(link: string): boolean {
    if (this.status === 'activating') { this.pendingLink = link; return false; }
    this.cancel();
    return true;
  }

  takePendingLink(): string | null { const link = this.pendingLink; this.pendingLink = null; return link; }

  run = async (prepare: () => Promise<Runtime | null>): Promise<Runtime | null> => {
    if (this.status !== 'idle') return null;
    const attempt = Symbol();
    this.current = attempt;
    this.publish('preparing');
    let runtime: Runtime | null = null;
    try {
      runtime = await prepare();
      if (!runtime) return null;
      if (this.current !== attempt) { runtime.close(); return null; }
      this.publish('activating');
      await this.activate(runtime.connection.id);
      if (this.current !== attempt) { runtime.close(); return null; }
      return runtime;
    } catch (error) {
      runtime?.close();
      if (this.current === attempt) throw error;
      return null;
    } finally {
      if (this.current === attempt) { this.current = null; this.publish('idle'); }
    }
  };

  dispose = () => { this.current = null; this.pendingLink = null; this.publish('idle'); };
}
