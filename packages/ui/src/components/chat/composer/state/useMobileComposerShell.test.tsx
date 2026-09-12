import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { ComposerEditorHandle } from '../editor/ComposerEditor';

const testWindow = new Window({ url: 'http://localhost:3000' });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
    window: testWindow, document: testWindow.document, navigator: testWindow.navigator,
    HTMLElement: testWindow.HTMLElement, MutationObserver: testWindow.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { useMobileComposerShell } = await import('./useMobileComposerShell');
let root: ReturnType<typeof createRoot>;

function Composer({ pickerOpen = false, alwaysExpanded = false }: { pickerOpen?: boolean; alwaysExpanded?: boolean }) {
    const editorRef = React.useRef<ComposerEditorHandle | null>(null);
    const formRef = React.useRef<HTMLFormElement | null>(null);
    const shell = useMobileComposerShell({
        isMobile: true, editorRef, formRef, alwaysExpanded,
        setExpandedInput() {},
        holders: {
            controlsPanelOpen: pickerOpen, attachMenuOpen: false, draftPickerOpen: false,
            issuePickerOpen: false, prPickerOpen: false, isDragging: false,
        },
    });
    return (
        <form ref={formRef}>
            <button type="button" onClick={shell.expand}>Expand</button>
            {shell.expanded && <textarea aria-label="Draft" onFocus={shell.onEditorFocus} />}
            <output>{shell.focused ? 'focused' : 'unfocused'}</output>
        </form>
    );
}

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
    for (const [name, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
    }
});

async function focusComposer(props: { pickerOpen?: boolean; alwaysExpanded?: boolean } = {}) {
    await act(async () => root.render(<Composer {...props} />));
    await act(async () => document.querySelector('button')?.click());
    await act(async () => document.querySelector('textarea')?.focus());
    expect(document.querySelector('output')?.textContent).toBe('focused');
}

async function dismissKeyboard() {
    await act(async () => {
        testWindow.dispatchEvent(new testWindow.CustomEvent('oc:keyboard-intent', { detail: { open: false } }));
    });
}

test('native keyboard dismissal collapses a composer whose editor still has focus', async () => {
    await focusComposer();
    await dismissKeyboard();
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.querySelector('output')?.textContent).toBe('unfocused');
    expect(document.documentElement.classList.contains('oc-composer-expanded')).toBe(false);
});

test('keyboard dismissal leaves the composer mounted while a picker holds it open', async () => {
    await focusComposer({ pickerOpen: true });
    await dismissKeyboard();
    expect(document.querySelector('textarea')).not.toBeNull();
});

test('keyboard dismissal preserves the tablet and hardware-keyboard layout', async () => {
    await focusComposer({ alwaysExpanded: true });
    await dismissKeyboard();
    expect(document.querySelector('textarea')).not.toBeNull();
});
