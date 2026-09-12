/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import type { SettingsPageSlug } from '@/lib/settings/metadata';
import type { MobileBackScope } from './mobileBackNavigation';

export type MobileAppActions = {
  registerBackHandler: (scope: MobileBackScope, handler: () => boolean) => () => void;
  /** Open the Changes surface as a modal and (optionally) navigate it to a specific diff. */
  openChanges: (options?: { diffPath?: string | null; staged?: boolean }) => void;
  /** Open the Files surface as a modal. */
  openFiles: () => void;
  /** Open the Settings surface as a modal. */
  openSettings: (section?: SettingsPageSlug) => void;
};

const DedicatedMobileAppContext = React.createContext<MobileAppActions | null>(null);

export const DedicatedMobileAppProvider: React.FC<{
  actions: MobileAppActions;
  children: React.ReactNode;
}> = ({ actions, children }) => (
  <DedicatedMobileAppContext.Provider value={actions}>{children}</DedicatedMobileAppContext.Provider>
);

/**
 * Returns the dedicated mobile app's surface-opening actions, or null when
 * not inside the dedicated mobile root. Components living in shared chat /
 * input code can use this to route navigation to mobile-native surfaces
 * (e.g. open the Changes diff for a file from PendingChangesBar) instead of
 * desktop sidebars.
 */
export const useMobileAppActions = (): MobileAppActions | null => React.useContext(DedicatedMobileAppContext);

/** Nested routes consume Back before their owning mobile screen closes. */
export const useMobileBackHandler = (scope: MobileBackScope, enabled: boolean, onBack: () => boolean): void => {
  const actions = useMobileAppActions();
  const handlerRef = React.useRef(onBack);
  React.useLayoutEffect(() => { handlerRef.current = onBack; }, [onBack]);
  React.useEffect(() => {
    if (!enabled || !actions) return;
    return actions.registerBackHandler(scope, () => handlerRef.current());
  }, [actions, enabled, scope]);
};
