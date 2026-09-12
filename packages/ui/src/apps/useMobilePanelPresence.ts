import React from 'react';

export const MOBILE_PANEL_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/** Keep closing panels painted until their transition ends. Reopening cancels
 * the pending removal; reduced motion skips both travel and the exit delay. */
export function useMobilePanelPresence(open: boolean, durationMs: number) {
  const [visible, setVisible] = React.useState(open);
  const [entered, setEntered] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  React.useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    if (reducedMotion) {
      setVisible(open);
      setEntered(open);
      return;
    }
    if (!open) {
      setEntered(false);
      const timer = window.setTimeout(() => setVisible(false), durationMs);
      return () => window.clearTimeout(timer);
    }
    setVisible(true);
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
  }, [durationMs, open, reducedMotion]);

  return { visible, entered, reducedMotion };
}
