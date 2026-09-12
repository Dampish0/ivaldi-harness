import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider, ensureSettingsDictionary } from '@/lib/i18n';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { ProfileForm, ProfileSetup } from '@/components/onboarding/ProfileSetup';
import { useUIStore } from '@/stores/useUIStore';
import { GitHubSettings } from '@/components/sections/openchamber/GitHubSettings';
import { OpenCodeUpdateToast } from '@/components/update/OpenCodeUpdateToast';
import { SidebarFooter } from './SidebarFooter';

const originalFetch = globalThis.fetch;
const originalAuth = useGitHubAuthStore.getState();
const originalMode = useProductModeStore.getState();
const originalUpdates = useUpdateStore.getState();
const originalProfile = useProfileStore.getState();
const originalUI = useUIStore.getState();
const globals = new Map<string, PropertyDescriptor | undefined>();
let root: Root;
let container: HTMLDivElement;
let testWindow: Window;
let requests: Array<{ url: string; method: string }>;
let respond: (url: string, init?: RequestInit) => Promise<Response>;

beforeEach(async () => {
  testWindow = new Window({ url: 'http://localhost:3000' });
  testWindow.open = () => null;
  for (const [name, value] of Object.entries({
    window: testWindow, document: testWindow.document, navigator: testWindow.navigator,
    HTMLElement: testWindow.HTMLElement, Element: testWindow.Element, Node: testWindow.Node,
    Event: testWindow.Event, CustomEvent: testWindow.CustomEvent,
    MouseEvent: testWindow.MouseEvent, MutationObserver: testWindow.MutationObserver,
    ResizeObserver: testWindow.ResizeObserver, DocumentFragment: testWindow.DocumentFragment,
    getComputedStyle: testWindow.getComputedStyle.bind(testWindow),
    requestAnimationFrame: testWindow.requestAnimationFrame.bind(testWindow),
    cancelAnimationFrame: testWindow.cancelAnimationFrame.bind(testWindow),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  requests = [];
  respond = async (url) => { throw new Error(`Unexpected test request: ${url}`); };
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, method: init?.method ?? 'GET' });
    return respond(url, init);
  }, originalFetch);
  useGitHubAuthStore.setState({ status: { connected: false }, hasChecked: true, isLoading: false });
  useProductModeStore.setState({ mode: 'work' });
  useUpdateStore.setState({ openCodeUpdate: null });
  useProfileStore.setState({ profile: { kind: 'missing' } });
  await ensureSettingsDictionary('en');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await testWindow.happyDOM.abort();
  globalThis.fetch = originalFetch;
  useGitHubAuthStore.setState(originalAuth, true);
  useProductModeStore.setState(originalMode, true);
  useUpdateStore.setState(originalUpdates, true);
  useProfileStore.setState(originalProfile, true);
  useUIStore.setState(originalUI, true);
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  globals.clear();
});

const render = async (children: React.ReactNode) => {
  await act(async () => {
    root.render(<React.StrictMode><I18nProvider>{children}</I18nProvider></React.StrictMode>);
  });
};

const footer = <SidebarFooter onOpenSettings={() => undefined} onOpenUpdate={() => undefined} showUpdateButton={false} />;
const profileLabel = () => container.querySelector('button')?.getAttribute('aria-label');
const requestUpdateCheck = async () => {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('openchamber:opencode-update-available', { detail: { version: '2.0.0' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('sidebar account details and actions', () => {
  test('shows the connected name, username and avatar in Work mode', async () => {
    useGitHubAuthStore.setState({ status: { connected: true, user: { login: 'test-user', name: 'Test User', avatarUrl: 'https://example.com/avatar.png' } } });
    await render(footer);
    expect(container.textContent).toContain('Test User');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/avatar.png');
    expect(profileLabel()).toContain('@test-user');
  });

  test('distinguishes disconnected, loading and failed status', async () => {
    await render(footer);
    expect(profileLabel()).toContain('GitHub not connected');
    await act(async () => useGitHubAuthStore.setState({ hasChecked: false, isLoading: true }));
    expect(profileLabel()).toContain('Loading...');
    expect(profileLabel()).not.toContain('GitHub not connected');
    await act(async () => useGitHubAuthStore.setState({ hasChecked: true, isLoading: false, status: { connected: false, error: 'offline' } }));
    expect(profileLabel()).toContain('Could not refresh GitHub connection status.');
    expect(profileLabel()).not.toContain('GitHub not connected');
  });

  test('starts authorization once under Strict Mode', async () => {
    respond = async () => Response.json({ deviceCode: 'test-device', userCode: 'TEST', verificationUri: 'https://github.com/login/device', expiresIn: 900, interval: 5 });
    await render(<GitHubSettings initialAction="connect" />);
    expect(requests.filter((request) => request.url.endsWith('/api/github/auth/start'))).toHaveLength(1);
    expect(container.textContent).toContain('TEST');
  });

  test('disconnects OAuth once and refreshes account details', async () => {
    useGitHubAuthStore.setState({ status: { connected: true, user: { login: 'test-user' } } });
    respond = async (url) => Response.json(url.endsWith('/status') ? { connected: false } : { removed: true });
    await render(<GitHubSettings initialAction="disconnect" />);
    expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(1);
    expect(useGitHubAuthStore.getState().status?.connected).toBe(false);
  });

  test('disables CLI use in Ivaldi without deleting OAuth credentials', async () => {
    useGitHubAuthStore.setState({ status: { connected: true, ghCli: { active: true, available: true, disabled: false } } });
    let disabledBody: BodyInit | null | undefined;
    respond = async (url, init) => {
      if (url.endsWith('/gh-cli')) disabledBody = init?.body;
      return Response.json(url.endsWith('/status') ? { connected: false } : { disabled: true });
    };
    await render(<GitHubSettings initialAction="disconnect" />);
    expect(disabledBody).toBe(JSON.stringify({ disabled: true }));
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  test('retains account details when disconnection fails', async () => {
    useGitHubAuthStore.setState({ status: { connected: true, user: { login: 'test-user' } } });
    respond = async () => new Response('', { status: 503 });
    await render(<GitHubSettings initialAction="disconnect" />);
    expect(useGitHubAuthStore.getState().status?.user?.login).toBe('test-user');
    expect(useGitHubAuthStore.getState().status?.connected).toBe(true);
  });
});

describe('persistent update availability', () => {
  test('shares one OpenCode check with the footer in Work mode', async () => {
    respond = async () => Response.json({ available: true, latestVersion: '2.0.0', upgrade: { supported: true } });
    await render(<><OpenCodeUpdateToast />{footer}</>);
    expect(container.querySelector('[aria-label="Update"]')).toBeNull();
    await requestUpdateCheck();
    expect(useUpdateStore.getState().openCodeUpdate?.version).toBe('2.0.0');
    expect(container.querySelector('[aria-label="Update"]')).not.toBeNull();
    expect(requests).toHaveLength(1);
  });

  test('failed or unknown checks preserve availability; authoritative empty clears it', async () => {
    respond = async () => Response.json({ available: true, latestVersion: '2.0.0', upgrade: { supported: true } });
    await render(<OpenCodeUpdateToast />);
    await requestUpdateCheck();
    respond = async () => Response.json({ available: null });
    await requestUpdateCheck();
    expect(useUpdateStore.getState().openCodeUpdate?.version).toBe('2.0.0');
    respond = async () => Response.json({ available: false, latestVersion: null, upgrade: { supported: false } });
    await requestUpdateCheck();
    expect(useUpdateStore.getState().openCodeUpdate).toBeNull();
  });

  test('an older check cannot erase a newer available version', async () => {
    let finishOld: (response: Response) => void = () => { throw new Error('Old request was not started'); };
    respond = () => new Promise((resolve) => { finishOld = resolve; });
    await render(<OpenCodeUpdateToast />);
    await requestUpdateCheck();
    respond = async () => Response.json({ available: true, latestVersion: '2.0.0', upgrade: { supported: true } });
    await requestUpdateCheck();
    await act(async () => finishOld(Response.json({ available: false, latestVersion: null, upgrade: { supported: false } })));
    expect(useUpdateStore.getState().openCodeUpdate?.version).toBe('2.0.0');
  });
});

describe('local profile onboarding', () => {
  test('rejects blank and oversized names and keeps onboarding incomplete', () => {
    expect(useProfileStore.getState().saveName('   ')).toBe('invalid');
    expect(useProfileStore.getState().saveName('a'.repeat(65))).toBe('invalid');
    expect(useProfileStore.getState().profile.kind).toBe('missing');
  });

  test('saves a trimmed name, survives reload and takes precedence over GitHub', async () => {
    expect(useProfileStore.getState().saveName('  Alex Smith  ')).toBeNull();
    useProfileStore.setState({ profile: { kind: 'unloaded' } });
    useProfileStore.getState().load();
    expect(useProfileStore.getState().profile).toEqual({ kind: 'ready', name: 'Alex Smith' });
    useGitHubAuthStore.setState({ status: { connected: true, user: { login: 'github-name', name: 'GitHub Name' } } });
    await render(footer);
    expect(container.textContent).toContain('Alex Smith');
    expect(container.textContent).not.toContain('GitHub Name');
    expect(container.textContent).not.toContain('GitHub not connected');
  });

  test('requires a name in the setup form', async () => {
    await render(<ProfileSetup />);
    expect(container.querySelector('button')?.disabled).toBe(true);
    expect(container.querySelector('input')?.required).toBe(true);
  });

  test('profile mode cards select a draft and apply it only on Save', async () => {
    useProfileStore.setState({ profile: { kind: 'ready', name: 'Alex' } });
    useProductModeStore.setState({ mode: 'developer' });
    useUIStore.setState({ contextPanelByDirectory: {} });
    useUIStore.getState().openContextSurface('/code', 'terminal');
    useUIStore.getState().openContextSurface('/work', 'notes');
    let saved = false;
    await render(<ProfileForm showModeSelection onSaved={() => { saved = true; }} />);
    const cards = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
    expect(cards.map((card) => card.textContent)).toEqual(['Work', 'Developer']);
    expect(cards[1].getAttribute('aria-pressed')).toBe('true');
    await act(async () => cards[0].click());
    expect(cards[0].getAttribute('aria-pressed')).toBe('true');
    expect(cards[1].getAttribute('aria-pressed')).toBe('false');
    expect(useProductModeStore.getState().mode).toBe('developer');
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    expect(saved).toBe(true);
    expect(useProductModeStore.getState().mode).toBe('work');
    expect(useUIStore.getState().contextPanelByDirectory['/code'].isOpen).toBe(false);
    expect(useUIStore.getState().contextPanelByDirectory['/work'].isOpen).toBe(true);
  });

  test('discarding the profile form leaves the current mode unchanged', async () => {
    useProfileStore.setState({ profile: { kind: 'ready', name: 'Alex' } });
    await render(<ProfileForm showModeSelection onSaved={() => undefined} />);
    const developerCard = container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[1];
    await act(async () => developerCard.click());
    await render(null);
    expect(useProductModeStore.getState().mode).toBe('work');
  });

  test('failed writes preserve the previous profile and allow retry', () => {
    useProfileStore.getState().saveName('Alex');
    const storage = Object.getOwnPropertyDescriptor(testWindow, 'localStorage');
    Object.defineProperty(testWindow, 'localStorage', { configurable: true, get: () => { throw new Error('Storage unavailable'); } });
    try {
      expect(useProfileStore.getState().saveName('Sam')).toBe('storage');
      expect(useProfileStore.getState().profile).toEqual({ kind: 'ready', name: 'Alex' });
    } finally {
      if (storage) Object.defineProperty(testWindow, 'localStorage', storage);
      else Reflect.deleteProperty(testWindow, 'localStorage');
    }
    expect(useProfileStore.getState().saveName('Sam')).toBeNull();
  });

  test('missing and malformed profiles cannot skip onboarding', () => {
    useProfileStore.setState({ profile: { kind: 'unloaded' } });
    useProfileStore.getState().load();
    expect(useProfileStore.getState().profile.kind).toBe('missing');
    window.localStorage.setItem('ivaldi-profile', JSON.stringify({ version: 1, name: 42 }));
    useProfileStore.setState({ profile: { kind: 'unloaded' } });
    useProfileStore.getState().load();
    expect(useProfileStore.getState().profile.kind).toBe('missing');
    window.localStorage.setItem('ivaldi-profile', '{bad json');
    useProfileStore.setState({ profile: { kind: 'unloaded' } });
    useProfileStore.getState().load();
    expect(useProfileStore.getState().profile.kind).toBe('unavailable');
  });
});
