import React from 'react';

const modalStack: HTMLElement[] = [];
let pageOverflowBeforeModals = '';
const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keeps retained drawers and nested fullscreen pages on the same focus contract. */
export const useMobileModalFocus = (
  surfaceRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  onEscape: (() => void) | null,
): void => {
  const onEscapeRef = React.useRef(onEscape);
  React.useLayoutEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);
  React.useEffect(() => {
    const surface = surfaceRef.current;
    if (!open || !surface) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modalStack.length === 0) pageOverflowBeforeModals = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalStack.push(surface);
    const isTopmost = () => modalStack.at(-1) === surface;
    const focusableElements = () => Array.from(surface.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.tabIndex >= 0 && !element.hasAttribute('disabled') && !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => {
      if (isTopmost()) (focusableElements()[0] ?? surface).focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost() || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        if (!onEscapeRef.current) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        surface.focus({ preventScroll: true });
      } else if (!surface.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      const wasTopmost = isTopmost();
      const index = modalStack.indexOf(surface);
      if (index >= 0) modalStack.splice(index, 1);
      document.body.style.overflow = modalStack.length ? 'hidden' : pageOverflowBeforeModals;
      if (wasTopmost && previousFocus?.isConnected && !previousFocus.closest('[inert], [aria-hidden="true"]')) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open, surfaceRef]);
};
