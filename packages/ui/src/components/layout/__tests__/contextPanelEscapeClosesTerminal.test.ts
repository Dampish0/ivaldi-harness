/**
 * Regression guard for https://github.com/openchamber/openchamber/issues/2644
 *
 * Escape while focus is inside the terminal must reach the PTY (e.g. Vim
 * Normal mode). The context panel still closes on Escape when focus is on
 * non-terminal panel chrome.
 */
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contextPanelSource = readFileSync(join(__dirname, '..', 'ContextPanel.tsx'), 'utf-8');

// The mobile drawer is rendered for real in a DOM. Only its tab contents and
// the stores behind the unmounted MCP pane are stubbed: the Escape handling
// under test lives in the drawer and its modal focus hook, not in them.
const testWindow = new Window({ url: 'http://localhost:3000' });
const savedGlobals = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: testWindow, document: testWindow.document, navigator: testWindow.navigator,
  HTMLElement: testWindow.HTMLElement, Node: testWindow.Node,
  requestAnimationFrame: testWindow.requestAnimationFrame.bind(testWindow),
  cancelAnimationFrame: testWindow.cancelAnimationFrame.bind(testWindow),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
const React = await import('react');
const pane = (name: string) => () => React.createElement('div', { 'data-pane': name, tabIndex: 0 });
mock.module('@/components/views/TerminalView', () => ({ TerminalView: pane('terminal') }));
mock.module('@/apps/MobileFilesSurface', () => ({ MobileFilesSurface: pane('files') }));
mock.module('@/apps/MobileChangesSurface', () => ({ MobileChangesSurface: pane('changes') }));
mock.module('@/components/layout/RightSidebarTabs', () => ({ ProjectContextPanel: pane('notes') }));
mock.module('@/components/mcp/McpDropdown', () => ({ McpDropdownContent: pane('mcp') }));
mock.module('@/hooks/useEffectiveDirectory', () => ({ useEffectiveDirectory: () => '/repo' }));
mock.module('@/stores/useProductModeStore', () => ({
  useProductModeStore: <T,>(select: (state: { mode: 'developer' }) => T) => select({ mode: 'developer' }),
}));
mock.module('@/stores/useDirectoryStore', () => ({ useDirectoryStore: () => '/repo' }));
mock.module('@/stores/useMcpStore', () => ({ useMcpStore: () => async () => {} }));
mock.module('@/stores/useMcpConfigStore', () => ({ useMcpConfigStore: () => async () => {} }));
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { MobileWorkspaceDrawer } = await import('@/apps/MobileWorkspaceDrawer');
type MobileWorkspaceTab = import('@/apps/MobileWorkspaceDrawer').MobileWorkspaceTab;

describe('issue #2644: Escape in terminal must not close the context panel', () => {
  test('the context panel captures Escape at the panel level', () => {
    expect(contextPanelSource).toContain('onKeyDownCapture={handlePanelKeyDownCapture}');
  });

  test('the capture handler skips closing when the event target is inside the terminal', () => {
    const start = contextPanelSource.indexOf('const handlePanelKeyDownCapture = React.useCallback(');
    expect(start).toBeGreaterThan(-1);
    const end = contextPanelSource.indexOf('}, [handleClose]);', start);
    expect(end).toBeGreaterThan(start);
    const handler = contextPanelSource.slice(start, end);

    expect(handler).toContain("event.key !== 'Escape'");
    expect(handler).toContain('isTerminalEventTarget(event.target)');
    expect(handler).toContain('event.preventDefault()');
    expect(handler).toContain('event.stopPropagation()');
    expect(handler).toContain('handleClose()');

    // Guard must return before preventDefault/stopPropagation so ghostty-web's
    // bubble-phase keydown listener can forward Escape to the PTY.
    const guardIndex = handler.indexOf('isTerminalEventTarget(event.target)');
    const preventIndex = handler.indexOf('event.preventDefault()');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(preventIndex).toBeGreaterThan(guardIndex);
  });

  test('ContextPanel imports the shared terminal focus helper', () => {
    expect(contextPanelSource).toContain("from '@/lib/terminalFocus'");
    expect(contextPanelSource).toContain('isTerminalEventTarget');
  });

});

describe('issue #2644: the mobile workspace keeps its terminal Escape exception', () => {
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });
  afterAll(async () => {
    await testWindow.happyDOM.abort();
    for (const [name, descriptor] of savedGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  const pressEscapeInPane = async (variant: 'drawer' | 'panel', tab: MobileWorkspaceTab) => {
    let closed = 0;
    const onClose = () => { closed += 1; };
    await act(async () => root.render(React.createElement(I18nProvider, null,
      React.createElement(MobileWorkspaceDrawer, {
        open: true, onClose, tab, onTabChange: () => {}, pendingChangesDiff: null,
        onOpenPlan: () => {}, onOpenMcpSettings: () => {}, variant,
      }))));
    await act(async () => testWindow.happyDOM.waitUntilComplete());
    const target = testWindow.document.querySelector(`[data-pane="${tab}"]`);
    expect(target).not.toBeNull();
    const event = new testWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => { target?.dispatchEvent(event); });
    return { closed, defaultPrevented: event.defaultPrevented };
  };

  for (const variant of ['drawer', 'panel'] as const) {
    test(`${variant}: Escape in the terminal tab stays with the terminal`, async () => {
      expect(await pressEscapeInPane(variant, 'terminal')).toEqual({ closed: 0, defaultPrevented: false });
    });

    test(`${variant}: Escape in another tab closes the workspace`, async () => {
      expect(await pressEscapeInPane(variant, 'files')).toEqual({ closed: 1, defaultPrevented: true });
    });
  }
});

type Listener = { capture: boolean; onEvent: (event: SimulatedEvent) => void };
type SimulatedEvent = {
  type: string;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  target: SimNode;
  preventDefault(): void;
  stopPropagation(): void;
};

class SimNode {
  readonly children: SimNode[] = [];
  private listeners: Listener[] = [];
  private parent: SimNode | null = null;

  addListener(listener: Listener): void {
    this.listeners.push(listener);
  }

  attach(child: SimNode): void {
    child.parent = this;
    this.children.push(child);
  }

  dispatch(type: string): SimulatedEvent {
    const buildPath = (target: SimNode): SimNode[] => {
      const ancestors: SimNode[] = [];
      let cursor: SimNode | null = target;
      while (cursor !== null) {
        ancestors.push(cursor);
        cursor = cursor.parent;
      }
      ancestors.reverse();
      return ancestors;
    };
    const path = buildPath(this);

    const event: SimulatedEvent = {
      type,
      defaultPrevented: false,
      propagationStopped: false,
      target: this,
      preventDefault() {
        event.defaultPrevented = true;
      },
      stopPropagation() {
        event.propagationStopped = true;
      },
    };

    for (let i = 0; i < path.length; i += 1) {
      if (event.propagationStopped) return event;
      for (const listener of path[i].listeners) {
        if (!listener.capture) continue;
        listener.onEvent(event);
        if (event.propagationStopped) return event;
      }
    }
    for (let i = path.length - 1; i >= 0; i -= 1) {
      if (event.propagationStopped) return event;
      for (const listener of path[i].listeners) {
        if (listener.capture) continue;
        listener.onEvent(event);
        if (event.propagationStopped) return event;
      }
    }
    return event;
  }
}

describe('issue #2644: fixed Escape propagation to the terminal', () => {
  test('when the panel skips terminal Escape, the terminal bubble handler receives it', () => {
    const panel = new SimNode();
    const terminalContainer = new SimNode();
    panel.attach(terminalContainer);

    const calls: string[] = [];
    const panelEscapeHandler = (event: SimulatedEvent) => {
      // Fixed behavior: do not close / stop when the target is the terminal.
      if (event.target === terminalContainer) {
        calls.push('panel-capture-skipped');
        return;
      }
      calls.push('panel-capture-closed');
      event.preventDefault();
      event.stopPropagation();
    };
    const terminalKeydownHandler = () => {
      calls.push('terminal-bubble');
    };

    panel.addListener({ capture: true, onEvent: panelEscapeHandler });
    terminalContainer.addListener({ capture: false, onEvent: terminalKeydownHandler });

    const event = terminalContainer.dispatch('keydown');

    expect(calls).toEqual(['panel-capture-skipped', 'terminal-bubble']);
    expect(event.propagationStopped).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  test('Escape outside the terminal still closes via the capture handler', () => {
    const panel = new SimNode();
    const headerButton = new SimNode();
    const terminalContainer = new SimNode();
    panel.attach(headerButton);
    panel.attach(terminalContainer);

    const calls: string[] = [];
    panel.addListener({
      capture: true,
      onEvent: (event) => {
        if (event.target === terminalContainer) return;
        calls.push('panel-capture-closed');
        event.preventDefault();
        event.stopPropagation();
      },
    });
    terminalContainer.addListener({
      capture: false,
      onEvent: () => calls.push('terminal-bubble'),
    });

    const event = headerButton.dispatch('keydown');
    expect(calls).toEqual(['panel-capture-closed']);
    expect(event.propagationStopped).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });
});
