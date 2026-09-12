import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

// Install the DOM before importing React DOM and Base UI, which detect it once.
const testWindow = new Window({ url: 'http://localhost:3000' });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: testWindow, document: testWindow.document, navigator: testWindow.navigator,
  localStorage: testWindow.localStorage, HTMLElement: testWindow.HTMLElement,
  Element: testWindow.Element, Node: testWindow.Node, Event: testWindow.Event,
  CustomEvent: testWindow.CustomEvent, MouseEvent: testWindow.MouseEvent,
  MutationObserver: testWindow.MutationObserver, ResizeObserver: testWindow.ResizeObserver,
  DocumentFragment: testWindow.DocumentFragment, ShadowRoot: testWindow.ShadowRoot,
  getComputedStyle: testWindow.getComputedStyle.bind(testWindow),
  requestAnimationFrame: testWindow.requestAnimationFrame.bind(testWindow),
  cancelAnimationFrame: testWindow.cancelAnimationFrame.bind(testWindow),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(async () => Response.json({ home: '/home/test' }), originalFetch);
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { DirectoryExplorerDialog } = await import('./DirectoryExplorerDialog');
const { I18nProvider } = await import('@/lib/i18n');
const { opencodeClient } = await import('@/lib/opencode/client');
const { useProductModeStore } = await import('@/stores/useProductModeStore');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const originalMode = useProductModeStore.getState();
const originalProjects = useProjectsStore.getState();
const originalDirectory = useDirectoryStore.getState();
const originalSessionUI = useSessionUIStore.getState();
let root: ReturnType<typeof createRoot>;
let addedPaths: string[];
let openedPaths: Array<string | undefined>;
let closed: boolean;
const originalListDirectory = opencodeClient.listLocalDirectory;
const originalCreateDirectory = opencodeClient.createDirectory;
let respondToListing: typeof opencodeClient.listLocalDirectory;
let respondToCreation: typeof opencodeClient.createDirectory;
let createCalls: Array<Parameters<typeof opencodeClient.createDirectory>>;

beforeEach(() => {
  createCalls = [];
  opencodeClient.listLocalDirectory = (...args) => respondToListing(...args);
  opencodeClient.createDirectory = (...args) => { createCalls.push(args); return respondToCreation(...args); };
  respondToListing = async (path) => path?.replace(/\/$/, '') === '/home/test' ? [
    { name: 'Documents', path: '/home/test/Documents', isDirectory: true, isFile: false },
  ] : [];
  respondToCreation = async (path) => ({ success: true, path });
  globalThis.fetch = Object.assign(async () => Response.json({ home: '/home/test' }), originalFetch);
  useProductModeStore.setState({ mode: 'work' });
  useDirectoryStore.setState({ homeDirectory: '/home/test' });
  addedPaths = [];
  openedPaths = [];
  closed = false;
  useProjectsStore.setState({ projects: [], addProject: (path) => {
    addedPaths.push(path);
    return { id: 'new-project', path };
  } });
  useSessionUIStore.setState({ openNewSessionDraft: (options) => { openedPaths.push(options?.directoryOverride ?? undefined); } });
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});
afterAll(async () => {
  opencodeClient.listLocalDirectory = originalListDirectory;
  opencodeClient.createDirectory = originalCreateDirectory;
  globalThis.fetch = originalFetch;
  useProductModeStore.setState(originalMode, true);
  useProjectsStore.setState(originalProjects, true);
  useDirectoryStore.setState(originalDirectory, true);
  useSessionUIStore.setState(originalSessionUI, true);
  await testWindow.happyDOM.abort();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
const render = async () => {
  await act(async () => root.render(<I18nProvider><DirectoryExplorerDialog open onOpenChange={(open) => { closed = !open; }} /></I18nProvider>));
};
const button = (label: string) => {
  const result = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === label);
  if (!result) throw new Error(`Missing button: ${label}. Rendered: ${document.body.textContent}`);
  return result;
};
const click = async (label: string) => { await act(async () => button(label).click()); };
const enterName = async (value: string) => {
  const input = document.querySelector('input');
  if (!input) throw new Error('Missing project name');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

test('Work starts with explicit choices and requires a selected existing folder', async () => {
  await render();
  expect(button('Use existing folder').getAttribute('aria-pressed')).toBe('true');
  expect(button('Add this folder').disabled).toBe(true);
  expect(document.querySelector('input')).toBeNull();
  expect(document.body.textContent).not.toContain('Show hidden');
  await click('Browse folders...');
  await click('Documents');
  expect(addedPaths).toEqual([]);
  await click('Use this folder');
  await click('Add this folder');
  expect(addedPaths).toEqual(['/home/test/Documents']);
  expect(createCalls).toEqual([]);
  expect(openedPaths).toEqual(['/home/test/Documents']);
  expect(closed).toBe(true);
});

test('new project rejects blank, invalid, and existing names and creates the named folder', async () => {
  await render();
  await click('Create new project');
  expect(button('Create project').disabled).toBe(true);
  for (const name of [' ', '../outside', 'con', 'Documents']) {
    await enterName(name);
    expect(button('Create project').disabled).toBe(true);
  }
  await enterName(' Summer campaign ');
  expect(button('Create project').disabled).toBe(false);
  await click('Create project');
  expect(createCalls).toEqual([['/home/test/Summer campaign', { asProject: true }]]);
  expect(addedPaths).toEqual(['/home/test/Summer campaign']);
});

test('failed creation preserves the form and never registers a project', async () => {
  respondToCreation = async () => { throw new Error('Permission denied'); };
  await render();
  await click('Create new project');
  await enterName('Campaign');
  await click('Create project');
  expect(addedPaths).toEqual([]);
  expect(closed).toBe(false);
  expect(button('Create project').disabled).toBe(false);
  expect(document.querySelector('input')?.value).toBe('Campaign');
});

test('failed folder listing blocks creation and exposes retry', async () => {
  respondToListing = async () => { throw new Error('Unavailable'); };
  await render();
  await click('Create new project');
  await enterName('Campaign');
  expect(button('Create project').disabled).toBe(true);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not load this folder.');
  respondToListing = async () => [];
  await click('Try again');
  expect(button('Create project').disabled).toBe(false);
});
