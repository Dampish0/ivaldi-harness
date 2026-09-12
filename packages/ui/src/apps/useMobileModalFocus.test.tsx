import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const testWindow = new Window({ url: 'http://localhost:3000' });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: testWindow, document: testWindow.document, navigator: testWindow.navigator,
  HTMLElement: testWindow.HTMLElement, Node: testWindow.Node,
  requestAnimationFrame: testWindow.requestAnimationFrame.bind(testWindow),
  cancelAnimationFrame: testWindow.cancelAnimationFrame.bind(testWindow),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
// Happy DOM has no layout. Give mounted controls a visible rectangle.
Object.defineProperty(testWindow.HTMLElement.prototype, 'getClientRects', {
  configurable: true,
  value() { return [new testWindow.DOMRect(0, 0, 100, 44)]; },
});
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { useMobileModalFocus } = await import('./useMobileModalFocus');
const { MobileOverlayPanel } = await import('@/components/ui/MobileOverlayPanel');
const { MobileWorkModelPicker } = await import('@/components/chat/MobileWorkModelPicker');
const { I18nProvider } = await import('@/lib/i18n');
const { DedicatedMobileAppProvider } = await import('./mobileAppContext');
const { createMobileBackNavigation } = await import('./mobileBackNavigation');
let root: ReturnType<typeof createRoot>;
let trigger: HTMLButtonElement;

function Modal({ name, open = true, onEscape }: { name: string; open?: boolean; onEscape: (() => void) | null }) {
  const ref = React.useRef<HTMLElement | null>(null);
  useMobileModalFocus(ref, open, onEscape);
  return (
    <section ref={ref} tabIndex={-1} inert={!open} aria-hidden={!open}>
      <button id={`${name}-skipped`} tabIndex={-1}>Skipped</button>
      <button id={`${name}-disabled`} disabled>Disabled</button>
      <button id={`${name}-first`}>First</button>
      <button id={`${name}-last`}>Last</button>
    </section>
  );
}

beforeEach(() => {
  document.body.style.overflow = 'auto';
  trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  testWindow.happyDOM.settings.device.prefersReducedMotion = 'no-preference';
  document.body.replaceChildren();
});
afterAll(async () => {
  await testWindow.happyDOM.abort();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
const render = async (content: React.ReactNode) => {
  await act(async () => root.render(<I18nProvider>{content}</I18nProvider>));
  await act(async () => testWindow.happyDOM.waitUntilComplete());
};
const key = async (key: string, shiftKey = false) => {
  const event = new testWindow.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  await act(async () => {
    testWindow.document.dispatchEvent(event);
  });
  return event.defaultPrevented;
};

test('traps Tab on enabled controls and restores focus and page scroll on close', async () => {
  await render(<Modal name="drawer" onEscape={() => {}} />);
  expect(document.activeElement?.id).toBe('drawer-first');
  expect(document.body.style.overflow).toBe('hidden');
  await key('Tab', true);
  expect(document.activeElement?.id).toBe('drawer-last');
  await key('Tab');
  expect(document.activeElement?.id).toBe('drawer-first');
  await render(<Modal name="drawer" open={false} onEscape={() => {}} />);
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe('auto');
});

test('only the top page consumes Escape and closing it returns focus to the drawer', async () => {
  const calls: string[] = [];
  const drawer = <Modal key="drawer" name="drawer" onEscape={() => { calls.push('drawer'); }} />;
  await render(drawer);
  await render([drawer, <Modal key="page" name="page" onEscape={() => { calls.push('page'); }} />]);
  expect(document.activeElement?.id).toBe('page-first');
  await key('Escape');
  expect(calls).toEqual(['page']);
  await render([drawer]);
  expect(document.activeElement?.id).toBe('drawer-first');
  expect(document.body.style.overflow).toBe('hidden');
  await key('Escape');
  expect(calls).toEqual(['page', 'drawer']);
  await render(null);
  expect(document.body.style.overflow).toBe('auto');
  expect(document.activeElement).toBe(trigger);
});

test('a retained closed drawer does not steal focus or intercept Escape', async () => {
  let closedDrawerCalls = 0;
  await render(<Modal name="drawer" open={false} onEscape={() => { closedDrawerCalls += 1; }} />);
  await key('Escape');
  expect(closedDrawerCalls).toBe(0);
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe('auto');
});

test('terminal Escape remains available without dismissing the modal below it', async () => {
  let underlyingCalls = 0;
  const drawer = <Modal key="drawer" name="drawer" onEscape={() => { underlyingCalls += 1; }} />;
  await render(drawer);
  await render([drawer, <Modal key="terminal" name="terminal" onEscape={null} />]);
  expect(await key('Escape')).toBe(false);
  expect(underlyingCalls).toBe(0);
  expect(document.activeElement?.id).toBe('terminal-first');
});

test('a real composer picker consumes native Back, closes, and restores its trigger', async () => {
  const navigation = createMobileBackNavigation();
  const actions = { registerBackHandler: navigation.register, openChanges() {}, openFiles() {}, openSettings() {} };
  function Picker() {
    const [open, setOpen] = React.useState(true);
    return <DedicatedMobileAppProvider actions={actions}>
      <MobileOverlayPanel open={open} onClose={() => setOpen(false)} title="Model picker">
        <button>Model choice</button>
      </MobileOverlayPanel>
    </DedicatedMobileAppProvider>;
  }
  await render(<Picker />);
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Model picker');
  await act(async () => { expect(navigation.back('overlay')).toBe(true); });
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-hidden')).toBe('true');
  expect(document.activeElement).toBe(trigger);
  expect(navigation.back('overlay')).toBe(false);
  expect(document.body.style.overflow).toBe('auto');
  await act(async () => testWindow.happyDOM.waitUntilComplete());
  expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
});

test('native Back closes the nested picker while retaining the underlying picker', async () => {
  const navigation = createMobileBackNavigation();
  const actions = { registerBackHandler: navigation.register, openChanges() {}, openFiles() {}, openSettings() {} };
  function Pickers() {
    const [nested, setNested] = React.useState(false);
    return <DedicatedMobileAppProvider actions={actions}>
      <MobileOverlayPanel open title="Models" onClose={() => {}}>
        <button id="open-variants" onClick={() => setNested(true)}>Thinking</button>
      </MobileOverlayPanel>
      <MobileOverlayPanel open={nested} title="Thinking" onClose={() => setNested(false)}>
        <button>High</button>
      </MobileOverlayPanel>
    </DedicatedMobileAppProvider>;
  }
  await render(<Pickers />);
  await act(async () => document.getElementById('open-variants')?.click());
  expect(document.querySelectorAll('[role="dialog"]').length).toBe(2);
  await act(async () => { expect(navigation.back('overlay')).toBe(true); });
  expect(document.querySelectorAll('[role="dialog"][aria-hidden="false"]').length).toBe(1);
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Models');
  expect(document.body.style.overflow).toBe('hidden');
  await act(async () => testWindow.happyDOM.waitUntilComplete());
  expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
});

test('reopening during a closing transition cancels removal and restores modal ownership', async () => {
  const panel = (open: boolean) => <MobileOverlayPanel open={open} title="Models" onClose={() => {}}><button id="choice">Choice</button></MobileOverlayPanel>;
  await render(panel(true));
  await act(async () => root.render(<I18nProvider>{panel(false)}</I18nProvider>));
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-hidden')).toBe('true');
  await render(panel(true));
  expect(document.querySelectorAll('[role="dialog"][aria-hidden="false"]').length).toBe(1);
  expect(document.body.style.overflow).toBe('hidden');
  expect(document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label')).toBe('Models');
});

test('reduced motion skips sheet travel and the closing delay', async () => {
  testWindow.happyDOM.settings.device.prefersReducedMotion = 'reduce';
  const panel = (open: boolean) => <MobileOverlayPanel open={open} title="Models" onClose={() => {}}><button>Choice</button></MobileOverlayPanel>;
  await render(panel(true));
  expect(document.querySelector<HTMLElement>('[role="dialog"]')?.style.transition).toBe('none');
  expect(document.querySelector<HTMLElement>('.pwa-overlay-panel')?.style.transform).toBe('none');
  await act(async () => root.render(<I18nProvider>{panel(false)}</I18nProvider>));
  expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
  expect(document.activeElement).toBe(trigger);
});

test('Work promotes the current model, deduplicates favorites, and selects by provider and model identity', async () => {
  const selected: string[][] = [];
  let favorites = 0;
  let thinking = 0;
  await render(<MobileWorkModelPicker open groups={[
    { id: 'b', name: 'Provider B', models: [{ id: 'same', name: 'Shared name', favorite: false }] },
    { id: 'a', name: 'Provider A', models: [{ id: 'same', name: 'Shared name', favorite: true }] },
  ]} selectedProvider="a" selectedModel="same" selectedName="Shared name" favorite thinkingLabel="High" retrying={false}
    onClose={() => {}} onSelect={(provider, model) => selected.push([provider, model])}
    onToggleFavorite={() => { favorites += 1; }} onThinking={() => { thinking += 1; }} onRetry={() => {}} onSettings={() => {}} />);
  const choices = document.querySelectorAll<HTMLButtonElement>('[data-mobile-work-models] button');
  expect(choices.length).toBe(2);
  expect(choices[0].textContent).toContain('Provider A');
  expect(choices[0].getAttribute('aria-pressed')).toBe('true');
  expect(choices[1].getAttribute('aria-pressed')).toBe('false');
  await act(async () => choices[1].click());
  expect(selected).toEqual([['b', 'same']]);
  const footerButtons = [...document.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent?.includes('Thinking') || button.getAttribute('aria-label') === 'Unfavorite');
  expect(footerButtons.length).toBe(2);
  await act(async () => footerButtons.forEach((button) => button.click()));
  expect([favorites, thinking]).toEqual([1, 1]);
});

test('an unavailable Work model list retains explicit recovery actions', async () => {
  let retries = 0;
  let settings = 0;
  await render(<MobileWorkModelPicker open groups={[]} selectedProvider={null} selectedModel={null} selectedName="" favorite={false} thinkingLabel={null} retrying={false}
    onClose={() => {}} onSelect={() => {}} onToggleFavorite={() => {}} onThinking={() => {}}
    onRetry={() => { retries += 1; }} onSettings={() => { settings += 1; }} />);
  const actions = document.querySelectorAll<HTMLButtonElement>('[data-mobile-work-models] button');
  expect(actions.length).toBe(2);
  await act(async () => actions.forEach((button) => button.click()));
  expect([retries, settings]).toEqual([1, 1]);
});
