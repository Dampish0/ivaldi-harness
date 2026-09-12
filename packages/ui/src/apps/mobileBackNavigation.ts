export type MobileBackScope = 'chat' | 'sessions' | 'workspace' | 'settings' | 'instances' | 'update' | 'plan' | 'overlay';

export const createMobileBackNavigation = () => {
  const handlers = new Map<MobileBackScope, Set<() => boolean>>();
  return {
    register(scope: MobileBackScope, handler: () => boolean) {
      const entries = handlers.get(scope) ?? new Set<() => boolean>();
      entries.add(handler);
      handlers.set(scope, entries);
      return () => {
        entries.delete(handler);
        if (entries.size === 0) handlers.delete(scope);
      };
    },
    back(scope: MobileBackScope): boolean {
      const entries = handlers.get(scope);
      if (!entries) return false;
      for (const handler of Array.from(entries).reverse()) {
        if (handler()) return true;
      }
      return false;
    },
  };
};
