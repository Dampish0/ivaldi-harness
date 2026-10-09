const BROWSER_PANEL_PARTITION = 'persist:openchamber-browser';

export const resolveBrowserPopupWindowOpen = (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { action: 'deny' };
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    return { action: 'deny' };
  }

  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 1100,
      height: 760,
      minWidth: 480,
      minHeight: 360,
      autoHideMenuBar: true,
      webPreferences: {
        partition: BROWSER_PANEL_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        allowRunningInsecureContent: false,
      },
    },
  };
};
