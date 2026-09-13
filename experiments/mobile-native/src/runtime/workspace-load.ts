import type { WorkspacePage } from './workspace.ts';

type WorkspaceLoadState =
  | { status: 'loading'; attempt: number; page: WorkspacePage | null }
  | { status: 'ready'; attempt: number; page: WorkspacePage }
  | { status: 'failed'; attempt: number; page: null };

/** One open workspace owns its authenticated request and WebView callbacks. */
export class WorkspaceLoader {
  private readonly fetchPage: () => Promise<WorkspacePage>;
  private attempt = 0;
  private state: WorkspaceLoadState = { status: 'loading', attempt: 0, page: null };
  private readonly listeners = new Set<() => void>();

  constructor(fetchPage: () => Promise<WorkspacePage>) { this.fetchPage = fetchPage; }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  private publish(state: WorkspaceLoadState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  load = async (): Promise<void> => {
    const attempt = ++this.attempt;
    this.publish({ status: 'loading', attempt, page: null });
    try {
      const page = await this.fetchPage();
      if (attempt === this.attempt) this.publish({ status: 'loading', attempt, page });
    } catch {
      this.failed(attempt);
    }
  };

  loading(attempt: number) {
    if (attempt === this.attempt && this.state.status === 'ready') this.publish({ ...this.state, status: 'loading' });
  }

  ready(attempt: number) {
    if (attempt === this.attempt && this.state.status === 'loading' && this.state.page) {
      this.publish({ status: 'ready', attempt, page: this.state.page });
    }
  }

  failed(attempt: number) {
    if (attempt === this.attempt && this.state.status !== 'failed') this.publish({ status: 'failed', attempt, page: null });
  }

  cancel = () => { this.attempt++; };
}
