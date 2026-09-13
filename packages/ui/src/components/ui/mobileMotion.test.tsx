import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

const testWindow = new Window({ url: 'http://localhost' });
testWindow.happyDOM.settings.device.prefersReducedMotion = 'reduce';
const saved = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: testWindow, document: testWindow.document, navigator: testWindow.navigator,
  HTMLElement: testWindow.HTMLElement, Element: testWindow.Element, SVGElement: testWindow.SVGElement,
  ResizeObserver: testWindow.ResizeObserver,
  requestAnimationFrame: testWindow.requestAnimationFrame.bind(testWindow),
  cancelAnimationFrame: testWindow.cancelAnimationFrame.bind(testWindow),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MobileDisclosure } = await import('./MobileDisclosure');
const { MobileComposerMorph } = await import('../chat/composer/ui/MobileComposerMorph');
const host = document.createElement('div');
document.body.append(host);
let root = createRoot(host);
const render = async (content: React.ReactNode) => {
  await React.act(async () => { root.render(content); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
};

afterEach(async () => {
  await React.act(async () => root.unmount());
  root = createRoot(host);
});
afterAll(async () => {
  await React.act(async () => root.unmount());
  await testWindow.happyDOM.abort();
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('composer preserves one editor and its draft through expand, collapse, and fullscreen', async () => {
  let unmounts = 0;
  function Editor() {
    React.useEffect(() => () => { unmounts++; }, []);
    return <textarea defaultValue="A draft that must survive" />;
  }
  const composer = (expanded: boolean, fullscreen = false) => (
    <MobileComposerMorph enabled expanded={expanded} fullscreen={fullscreen} pill={<button>Compose</button>}>
      <Editor />
    </MobileComposerMorph>
  );
  await render(composer(false));
  const editor = host.querySelector('textarea');
  expect(editor?.closest('[inert]')).not.toBeNull();
  for (const [expanded, fullscreen] of [[true, false], [false, false], [true, true], [true, false]]) {
    await render(composer(expanded, fullscreen));
    expect(host.querySelector('textarea')).toBe(editor);
    expect(host.querySelectorAll('textarea').length).toBe(1);
    expect(editor?.value).toBe('A draft that must survive');
    expect(Boolean(editor?.closest('[inert]'))).toBe(!expanded);
  }
  expect(unmounts).toBe(0);
});

test('closed disclosures do not mount descendants; reduced-motion close releases them', async () => {
  let mounted = 0;
  function Child() {
    React.useEffect(() => { mounted++; return () => { mounted--; }; }, []);
    return <button>Nested session</button>;
  }
  const content = (open: boolean) => <MobileDisclosure open={open}><Child /></MobileDisclosure>;
  await render(content(false));
  expect(mounted).toBe(0);
  await render(content(true));
  expect(mounted).toBe(1);
  await render(content(false));
  expect(host.querySelector('[data-mobile-disclosure]')?.hasAttribute('inert')).toBe(true);
  expect(mounted).toBe(0);
});
