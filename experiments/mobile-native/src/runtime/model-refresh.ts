import type { ModelChoice, ModelSelection, Session } from './schema.ts';

type ModelCatalog = { models: ModelChoice[]; defaults: { [providerId: string]: string } };
export type CatalogAvailability = { status: 'unavailable'; available: false } | { status: 'loading' | 'error'; available: boolean } | { status: 'ready'; available: true };
type CatalogSelection = { activeId: string | null; model: ModelSelection | null; agent: string; revision: number; directory: string | null | undefined; scopeRevision: number; modelCatalog: CatalogAvailability; agentCatalog: CatalogAvailability };
type CatalogPatch = { modelCatalog: CatalogAvailability; models?: ModelChoice[]; model?: ModelSelection | null; agentCatalog?: CatalogAvailability } | { agentCatalog: CatalogAvailability; agents?: string[]; agent?: string };
type CatalogAccess = {
  readModels: (directory: string | undefined) => Promise<ModelCatalog>;
  readAgents: (directory: string | undefined) => Promise<string[]>;
  getSelection: () => CatalogSelection;
  publish: (patch: CatalogPatch) => void;
};

/** null is an unresolved saved session; undefined is an untargeted new draft. */
export function chatCatalogDirectory(state: { activeId: string | null; draftDirectory: string | null; sessions: ReadonlyArray<Pick<Session, 'id' | 'directory'>> }): string | null | undefined {
  return state.activeId === null ? state.draftDirectory ?? undefined : state.sessions.find(session => session.id === state.activeId)?.directory ?? null;
}

/** Refreshes requested after a backend reload cannot join an older catalog read. */
export class ModelCatalogRefresh {
  private readonly access: CatalogAccess;
  private pending: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(access: CatalogAccess) { this.access = access; }

  refresh = (): Promise<void> => this.enqueue(false);
  initialize = (): Promise<void> => this.enqueue(true);
  dispose = () => { this.disposed = true; };

  readForDirectory = async (directory: string | undefined): Promise<{ models: ModelChoice[]; agents: string[] }> => {
    this.assertOpen();
    const [catalog, agents] = await Promise.all([this.access.readModels(directory), this.access.readAgents(directory)]);
    this.assertOpen();
    return { models: catalog.models, agents };
  };

  private assertOpen() { if (this.disposed) throw new Error('Model catalog is closed'); }

  private assertScope(selection: CatalogSelection) {
    this.assertOpen();
    const current = this.access.getSelection();
    if (current.directory !== selection.directory || current.scopeRevision !== selection.scopeRevision) throw new Error('Model catalog scope changed');
    return current;
  }

  private enqueue(initialize: boolean): Promise<void> {
    const selection = this.access.getSelection();
    const operation = this.pending.catch(() => undefined).then(async () => {
      const current = this.assertScope(selection);
      const { directory, revision } = selection;
      if (directory === null) {
        this.access.publish({ modelCatalog: { status: 'error', available: false }, agentCatalog: { status: 'error', available: false } });
        throw new Error('Session directory unavailable');
      }
      this.access.publish({ modelCatalog: { status: 'loading', available: current.modelCatalog.available }, agentCatalog: { status: 'loading', available: current.agentCatalog.available } });
      const results = await Promise.allSettled([
        this.access.readModels(directory).then(catalog => {
          const current = this.assertScope(selection);
          if (!initialize || current.activeId !== null || current.revision !== revision) {
            this.access.publish({ models: catalog.models, modelCatalog: { status: 'ready', available: true } });
            return;
          }
          const previous = current.model;
          const selected = catalog.models.find(model => model.id === previous?.modelID && model.providerID === previous.providerID)
            ?? catalog.models.find(model => catalog.defaults[model.providerID] === model.id) ?? catalog.models[0];
          const variant = previous?.providerID === selected?.providerID && previous?.modelID === selected?.id ? previous?.variant : undefined;
          this.access.publish({ models: catalog.models, model: selected ? { providerID: selected.providerID, modelID: selected.id, variant } : null, modelCatalog: { status: 'ready', available: true } });
        }).catch(error => {
          const current = this.assertScope(selection);
          this.access.publish({ modelCatalog: { status: 'error', available: current.modelCatalog.available } });
          throw error;
        }),
        this.access.readAgents(directory).then(agents => {
          const current = this.assertScope(selection);
          if (!initialize || current.activeId !== null || current.revision !== revision) {
            this.access.publish({ agents, agentCatalog: { status: 'ready', available: true } });
            return;
          }
          this.access.publish({ agents, agent: agents.includes(current.agent) ? current.agent : agents.includes('build') ? 'build' : agents[0] ?? '', agentCatalog: { status: 'ready', available: true } });
        }).catch(error => {
          const current = this.assertScope(selection);
          this.access.publish({ agentCatalog: { status: 'error', available: current.agentCatalog.available } });
          throw error;
        }),
      ]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    });
    this.pending = operation;
    return operation;
  }
}
