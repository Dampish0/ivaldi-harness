import React from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useMobileModalFocus } from './useMobileModalFocus';

const SURFACE_ROOT_ID = 'mobile-surface-root';
const ENTER_DELAY_MS = 16;
// Enter-slide duration. Heavy content is revealed when this transition actually
// ends (transitionend); this also feeds the fallback timer.
const ENTER_DURATION_MS = 200;

const ensureSurfaceRoot = (): HTMLElement => {
  let root = document.getElementById(SURFACE_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = SURFACE_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
};

export type MobileFullscreenSurfaceProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  /** If true, leave Escape available to nested content instead of dismissing the surface. */
  disableEscapeDismiss?: boolean;
  /** If true, render no header and let the child render its own (with its own back button). */
  headerless?: boolean;
  /** Drop the header's bottom divider (quiet single-page surfaces). */
  noHeaderBorder?: boolean;
  ariaLabel?: string;
  /**
   * `dialog` packs the same surface into a centered card over a scrim instead
   * of covering the app. Tablets use it: a settings or instances page stretched
   * across a 13" screen is mostly empty space, and losing the chat entirely for
   * an app-level page is a heavier context switch than the content deserves.
   */
  variant?: 'fullscreen' | 'dialog';
  /**
   * What the dialog centers on. App-level pages (settings, instances) belong to
   * the whole window; content that came out of the chat column stays with it.
   */
  dialogAlign?: 'chat' | 'app';
  /** Optional dialog-width override for the centered card. The default is 720px. */
  dialogClassName?: string;
  children: React.ReactNode;
};

/** Fullscreen overlay surface for the phone layout: covers the whole app
    (including the header), slides in from the right like a navigation push,
    and closes via the header back arrow, Escape, or the Android back button. */
export const MobileFullscreenSurface: React.FC<MobileFullscreenSurfaceProps> = ({
  open,
  onClose,
  title,
  subtitle,
  trailing,
  disableEscapeDismiss = false,
  headerless = false,
  noHeaderBorder = false,
  ariaLabel,
  variant = 'fullscreen',
  dialogAlign = 'chat',
  dialogClassName,
  children,
}) => {
  const { t } = useI18n();
  const rootRef = React.useRef<HTMLElement | null>(null);
  const [entered, setEntered] = React.useState(false);
  const [contentReady, setContentReady] = React.useState(false);
  const surfaceRef = React.useRef<HTMLElement | null>(null);

  if (!rootRef.current) {
    rootRef.current = ensureSurfaceRoot();
  }

  React.useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = window.setTimeout(() => setEntered(true), ENTER_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  // Defer mounting heavy children until the enter slide finishes, so the
  // animation stays smooth instead of competing with a large content render.
  // Primary trigger is the slide's transitionend (below); this is just a
  // fallback in case it never fires (reduced motion / interrupted transition).
  React.useEffect(() => {
    if (!open) {
      setContentReady(false);
      return;
    }
    const id = window.setTimeout(() => setContentReady(true), ENTER_DELAY_MS + ENTER_DURATION_MS + 80);
    return () => window.clearTimeout(id);
  }, [open]);

  useMobileModalFocus(surfaceRef, open, disableEscapeDismiss ? null : onClose);

  if (!open || !rootRef.current) return null;

  const isDialog = variant === 'dialog';

  const surface = (
    <section
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      className={cn(
        'flex flex-col bg-background text-foreground',
        isDialog
          ? 'h-[min(88dvh,860px)] w-full overflow-hidden rounded-xl border border-border/70 shadow-lg'
          : 'oc-keyboard-inset-surface fixed inset-0 z-50',
      )}
      style={isDialog ? {
        // Scale/fade instead of the push slide: the card is not a navigation
        // step, and a settled `transform: none` keeps it off its own
        // compositing layer (iOS clips those to the safe-area viewport).
        opacity: entered ? 1 : 0,
        transform: entered ? 'none' : 'scale(0.97)',
        transition: `opacity ${ENTER_DURATION_MS}ms ease-out, transform ${ENTER_DURATION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
      } : {
        paddingTop: 'var(--oc-safe-area-top, 0px)',
        // Push-style enter: slide in from the right edge; settled state drops
        // the transform entirely so the surface isn't kept on a compositing
        // layer (iOS clips those to the safe-area viewport).
        transform: entered ? 'none' : 'translateX(100%)',
        transition: `transform ${ENTER_DURATION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
      }}
      onTransitionEnd={(event) => {
        // Reveal content exactly when the enter transition ends — not on a fixed timer.
        if (entered && event.target === event.currentTarget && event.propertyName === 'transform') {
          setContentReady(true);
        }
      }}
    >
      {!headerless ? (
        <header
          className={cn(
            'flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-2 px-3',
            !noHeaderBorder && 'border-b border-border/70',
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1 shrink-0 rounded-md text-muted-foreground"
            aria-label={t('mobile.surface.closeAria')}
            onClick={onClose}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="close" className="size-5" />
          </Button>
          <div className="min-w-0 flex-1 px-1">
            {title ? <h2 className="truncate typography-ui-label text-foreground">{title}</h2> : null}
            {subtitle ? <p className="truncate typography-micro text-muted-foreground">{subtitle}</p> : null}
          </div>
          {trailing ? <div className="flex shrink-0 items-center gap-1.5">{trailing}</div> : null}
        </header>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        {contentReady ? (
          <div className="h-full" style={{ animation: 'oc-surface-content-in 200ms ease-out' }}>
            {children}
          </div>
        ) : null}
      </div>
      <style>{'@keyframes oc-surface-content-in { from { opacity: 0 } to { opacity: 1 } }'}</style>
    </section>
  );

  if (!isDialog) return createPortal(surface, rootRef.current);

  return createPortal(
    <div
      className="oc-keyboard-inset-surface fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ease-out"
      style={{
        background: 'color-mix(in srgb, var(--surface-overlay) 45%, transparent)',
        opacity: entered ? 1 : 0,
        // 'chat' matches every other mobile overlay (the sessions sidebar keeps
        // its width); 'app' ignores the panels and centers on the window.
        paddingLeft: dialogAlign === 'chat' ? 'max(1rem, var(--oc-chat-inset-left, 0px))' : '1rem',
        paddingRight: dialogAlign === 'chat' ? 'max(1rem, var(--oc-chat-inset-right, 0px))' : '1rem',
        paddingTop: 'max(1rem, var(--oc-safe-area-top, 0px))',
      }}
      onClick={onClose}
    >
      <div
        className={cn('flex w-full justify-center', dialogClassName ?? 'max-w-[720px]')}
        onClick={(event) => event.stopPropagation()}
      >
        {surface}
      </div>
    </div>,
    rootRef.current,
  );
};
