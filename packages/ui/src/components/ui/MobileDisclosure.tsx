import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** Retain closing rows while their occupied space contracts. Text is never scaled. */
export function MobileDisclosure({ open, children, className, enabled = true, resize = false }: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  enabled?: boolean;
  resize?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!enabled || !open || !resize || !contentRef.current) return;
    const content = contentRef.current;
    const measure = () => setHeight(content.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [enabled, open, resize]);
  if (!enabled) return <>{children}</>;
  return (
    <div inert={!open} aria-hidden={!open} data-mobile-disclosure={open ? 'open' : 'closed'}>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: resize ? height ?? 'auto' : 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div ref={contentRef} className={className}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
