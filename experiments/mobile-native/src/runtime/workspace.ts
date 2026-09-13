export type WorkspacePage = { html: string; baseUrl: string };

export function workspaceUrl(base: string, sessionId: string | null) {
  const url = new URL(`${base.replace(/\/+$/, '')}/mobile`);
  if (sessionId) url.searchParams.set('session', sessionId);
  return url;
}

// Only the connected server's application HTML gets this bootstrap. It runs
// before its existing modules. No native bridge is exposed to page content.
export function prepareWorkspacePage(html: string, page: URL, token: string | null, mode: 'work' | 'developer'): WorkspacePage {
  if (!/<head[\s>]/i.test(html) || !/id=["']root["']/.test(html)) throw new Error('Server application unavailable');
  const literal = (value: string | null) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const apiBase = new URL('.', page).href.replace(/\/$/, '');
  const bootstrap = `<base href=${literal(apiBase + '/')}>` +
    `<script>window.__OPENCHAMBER_API_BASE_URL__=${literal(apiBase)};window.__OPENCHAMBER_CLIENT_TOKEN__=${literal(token)};history.replaceState(null,'',${literal(page.href)});localStorage.setItem('ivaldi-product-mode',${literal(JSON.stringify({ state: { mode }, version: 1 }))});</script>`;
  return { html: html.replace(/<head([^>]*)>/i, match => match + bootstrap), baseUrl: page.href };
}

export function allowsWorkspaceNavigation(url: string, baseUrl: string) {
  if (url === 'about:blank') return true;
  try { const target = new URL(url); const base = new URL(baseUrl); return target.origin === base.origin && target.pathname === base.pathname && !target.username && !target.password; }
  catch { return false; }
}
