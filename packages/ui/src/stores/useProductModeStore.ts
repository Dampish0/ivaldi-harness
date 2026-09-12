import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_PRODUCT_MODE, isDeveloperOnlyContextMode, type ProductMode } from '@/lib/productMode';
import { useUIStore } from './useUIStore';

type ProductModeStore = {
  mode: ProductMode;
  setMode: (mode: ProductMode) => void;
};

export const useProductModeStore = create<ProductModeStore>()(
  persist(
    (set) => ({
      mode: DEFAULT_PRODUCT_MODE,
      setMode: (mode) => {
        if (mode === 'work') {
          const uiState = useUIStore.getState();
          uiState.setNewWorktreeDialogOpen(false);
          uiState.setWorktreesPageProjectId(null);
          for (const [directory, panelState] of Object.entries(uiState.contextPanelByDirectory)) {
            const activeTab = panelState.tabs.find((tab) => tab.id === panelState.activeTabId);
            if (panelState.isOpen && activeTab && isDeveloperOnlyContextMode(activeTab.mode)) {
              uiState.closeContextPanel(directory);
            }
          }
        }
        set({ mode });
      },
    }),
    {
      name: 'ivaldi-product-mode',
      version: 1,
    },
  ),
);
