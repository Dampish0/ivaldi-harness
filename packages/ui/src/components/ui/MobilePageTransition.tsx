import React from 'react';
import { AnimatePresence, motion, useReducedMotion, useIsPresent } from 'motion/react';

function Page({ direction, children }: { direction: number; children: React.ReactNode }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      className="absolute inset-0 flex min-h-0 flex-col bg-background"
      inert={!present}
      aria-hidden={!present}
      custom={direction}
      variants={{
        enter: (travel: number) => ({ x: reducedMotion ? 0 : `${travel * 100}%`, opacity: 1 }),
        settled: { x: 0, opacity: 1 },
        exit: (travel: number) => ({ x: reducedMotion ? 0 : `${travel * -25}%`, opacity: 0 }),
      }}
      initial="enter"
      animate="settled"
      exit="exit"
      transition={{ duration: reducedMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
    >{children}</motion.div>
  );
}

export function MobilePageTransition({ route, depth, children }: {
  route: string;
  depth: number;
  children: React.ReactNode;
}) {
  const [previous, setPrevious] = React.useState({ route, depth, direction: 1 });
  const direction = route === previous.route ? previous.direction : depth < previous.depth ? -1 : 1;
  if (route !== previous.route) setPrevious({ route, depth, direction });
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden" data-mobile-page-transition="true">
      <AnimatePresence initial={false} custom={direction}>
        <Page key={route} direction={direction}>{children}</Page>
      </AnimatePresence>
    </div>
  );
}
