import { createConfiguredWebAPIs } from './runtimeConfig';
import type { RuntimeAPIs } from '@ivaldi/ui/lib/api/types';
import '@ivaldi/ui/index.css';
import '@ivaldi/ui/styles/fonts';

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

window.__OPENCHAMBER_RUNTIME_APIS__ = createConfiguredWebAPIs();

void import('@ivaldi/ui/apps/renderElectronMiniChatApp')
  .then(({ renderElectronMiniChatApp }) => {
    renderElectronMiniChatApp(window.__OPENCHAMBER_RUNTIME_APIS__ ?? createConfiguredWebAPIs());
  });
