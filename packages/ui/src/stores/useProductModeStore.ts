import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_PRODUCT_MODE, type ProductMode } from '@/lib/productMode';

type ProductModeStore = {
  mode: ProductMode;
  setMode: (mode: ProductMode) => void;
};

export const useProductModeStore = create<ProductModeStore>()(
  persist(
    (set) => ({
      mode: DEFAULT_PRODUCT_MODE,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'ivaldi-product-mode',
      version: 1,
    },
  ),
);
