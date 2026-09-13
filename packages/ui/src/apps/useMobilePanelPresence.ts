import React from 'react';

const ENTER_DURATION_MS = 280;
const EXIT_DURATION_MS = 200;

/** Keep closing panels painted until their transition ends. Reopening cancels
 * the pending removal; reduced motion skips both travel and the exit delay. */
export function useMobilePanelPresence(open: boolean) {
  const [visible, setVisible] = React.useState(open);
  const [entered, setEntered] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const retained = React.useRef(false);

  React.useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  React.useLayoutEffect(() => {
    if (reducedMotion) {
      retained.current = open;
      setVisible(open);
      setEntered(open);
      return;
    }
    if (!open) {
      setEntered(false);
      if (!retained.current) return;
      const timer = window.setTimeout(() => {
        retained.current = false;
        setVisible(false);
      }, EXIT_DURATION_MS);
      return () => window.clearTimeout(timer);
    }
    setVisible(true);
    // A closing panel is already painted. Reverse its current transition
    // without imposing the initial mount's two-frame delay again.
    if (retained.current) {
      setEntered(true);
      return;
    }
    retained.current = true;
    let nextFrame = 0;
    // Paint the start before requesting the destination. Timers can coalesce
    // both writes into one frame under load and skip the entrance.
    const frame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(nextFrame);
    };
  }, [open, reducedMotion]);

  return {
    visible, entered, reducedMotion,
    durationMs: open ? ENTER_DURATION_MS : EXIT_DURATION_MS,
    easing: open ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 1, 1)',
  };
}
