const WEB_AND_MAIL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

// Mirrors BLOCKED_APP_LINK_SCHEMES in packages/ui/src/lib/url.ts. The renderer
// asks the user before opening an app link; main re-checks because it is the
// side that holds the privilege.
const BLOCKED_APP_LINK_PROTOCOLS = new Set([
  'javascript:', 'data:', 'vbscript:', 'blob:', 'filesystem:', 'about:',
  'chrome:', 'chrome-extension:', 'devtools:', 'moz-extension:', 'ms-browser-extension:',
  'file:',
  'ws:', 'wss:', 'ftp:', 'ftps:',
  'intent:',
  'ms-msdt:', 'search-ms:', 'shell:',
  'ivaldi:', 'openchamber:', 'openchamber-ui:', 'capacitor:',
]);

const APP_LINK_PROTOCOL_RE = /^[a-z][a-z0-9+.-]{1,31}:$/;

// Callers pass strings: Electron's navigation events, and the IPC handler after
// it parses its argument. Anything else throws on trim and counts as unsafe.
const parseProtocol = (url) => {
  try {
    return new URL(url.trim()).protocol.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Whether a navigation or window.open the app did not keep in-app may go to
 * the OS handler without asking. `shell.openExternal` launches whatever app
 * owns the scheme, so a `file:`, `ms-msdt:` or custom-protocol link in
 * rendered content would otherwise launch local code. Only web and mail
 * links leave the app this way.
 */
export const isSafeExternalUrl = (url) => {
  const protocol = parseProtocol(url);
  return protocol !== null && WEB_AND_MAIL_PROTOCOLS.has(protocol);
};

/**
 * Whether the renderer's explicit open request may proceed. Adds application
 * deep links such as `obsidian:` or `vscode:`, which the UI confirms with the
 * user first, and still refuses the schemes that launch local code.
 */
export const isOpenableExternalUrl = (url) => {
  const protocol = parseProtocol(url);
  if (protocol === null) return false;
  if (WEB_AND_MAIL_PROTOCOLS.has(protocol)) return true;
  return APP_LINK_PROTOCOL_RE.test(protocol) && !BLOCKED_APP_LINK_PROTOCOLS.has(protocol);
};
