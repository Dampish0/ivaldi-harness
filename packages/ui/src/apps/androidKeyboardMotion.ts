import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { z } from 'zod';
import { observeNativeKeyboardHeight } from '@/lib/hardwareKeyboard';

const frameSchema = z.object({
  height: z.number().finite().nonnegative(),
  phase: z.enum(['start', 'progress', 'end']),
});

const keyboardMotion = registerPlugin<{
  start(): Promise<{ supported: boolean }>;
  addListener(event: 'frame', listener: (frame: z.input<typeof frameSchema>) => void): Promise<PluginListenerHandle>;
}>('IvaldiKeyboardMotion');

/** Android 11+ owns IME progress; older APKs keep the existing Capacitor fallback. */
export async function startAndroidKeyboardMotion(): Promise<(() => void) | null> {
  const root = document.documentElement;
  let targetHeight = 0;
  let currentHeight = 0;
  let layoutHeight = 0;
  const listener = await keyboardMotion.addListener('frame', (input) => {
    const parsed = frameSchema.safeParse(input);
    if (!parsed.success) return;
    const frame = parsed.data;
    if (frame.phase === 'start') {
      targetHeight = frame.height;
      // Keep the full-height clipping area during keyboard entry. On dismissal,
      // restore it immediately and compensate the composer by the current inset.
      if (targetHeight < currentHeight) layoutHeight = targetHeight;
      root.classList.toggle('oc-keyboard-open', targetHeight > 0);
      if (targetHeight > 0) observeNativeKeyboardHeight(targetHeight);
      window.dispatchEvent(new CustomEvent('oc:keyboard-intent', { detail: { open: targetHeight > 0 } }));
    }
    if (frame.phase === 'end') {
      targetHeight = frame.height;
      layoutHeight = frame.height;
    }
    if (frame.phase !== 'start') currentHeight = frame.height;
    root.classList.add('oc-android-ime-motion');
    root.style.setProperty('--oc-kb-layout', `${layoutHeight}px`);
    root.style.setProperty('--oc-keyboard-inset', `${currentHeight}px`);
    root.style.setProperty('--oc-android-keyboard-shift', `${layoutHeight - currentHeight}px`);
    if (frame.phase === 'end') {
      root.classList.toggle('oc-keyboard-open', frame.height > 0);
      window.dispatchEvent(new CustomEvent('oc:keyboard-settled', { detail: { open: frame.height > 0 } }));
    }
  });
  try {
    const { supported } = await keyboardMotion.start();
    if (!supported) { await listener.remove(); return null; }
  } catch {
    await listener.remove();
    return null;
  }
  return () => {
    void listener.remove();
    root.classList.remove('oc-android-ime-motion');
    for (const name of ['--oc-kb-layout', '--oc-keyboard-inset', '--oc-android-keyboard-shift']) root.style.removeProperty(name);
  };
}
