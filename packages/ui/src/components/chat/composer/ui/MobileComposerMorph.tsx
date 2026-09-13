import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

/** One live editor across pill/full transitions. Only the active layer can take focus. */
export function MobileComposerMorph({ enabled, expanded, fullscreen = false, pill, children }: {
  enabled: boolean;
  expanded: boolean;
  fullscreen?: boolean;
  pill: React.ReactNode;
  children: React.ReactNode;
}) {
  const pillRef = React.useRef<HTMLDivElement>(null);
  const fullRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  const [backgroundHeight, setBackgroundHeight] = React.useState<number | null>(null);
  const reducedMotion = useReducedMotion();

  React.useLayoutEffect(() => {
    if (!enabled || fullscreen) return;
    const content = expanded ? fullRef.current : pillRef.current;
    if (!content) return;
    const measure = () => {
      setHeight(content.getBoundingClientRect().height);
      const card = content.querySelector('[data-ivaldi-composer], [data-mobile-composer-pill]');
      setBackgroundHeight(card?.getBoundingClientRect().height ?? null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [enabled, expanded, fullscreen]);

  if (!enabled) return <>{children}</>;

  return (
    <motion.div
      className="oc-composer-morph relative"
      data-expanded={expanded}
      data-fullscreen={fullscreen}
      initial={false}
      animate={{ height: fullscreen ? '100%' : height ?? 'auto' }}
      transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        aria-hidden="true"
        className="oc-composer-morph-shape pointer-events-none absolute inset-x-0 bottom-0 rounded-[28px] border border-border/70 bg-[var(--surface-elevated)]"
        initial={false}
        animate={{ height: fullscreen ? '100%' : backgroundHeight ?? 56 }}
        transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      />
      <div ref={pillRef} className="oc-composer-morph-pill" inert={expanded} aria-hidden={expanded}>
        {pill}
      </div>
      <div ref={fullRef} className="oc-composer-morph-full" inert={!expanded} aria-hidden={!expanded}>
        {children}
      </div>
    </motion.div>
  );
}
