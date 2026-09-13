import React from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useMobileModalFocus } from './useMobileModalFocus';
import { useMobilePanelPresence } from './useMobilePanelPresence';

const SURFACE_ROOT_ID = 'mobile-surface-root';

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
  const { visible, entered, reducedMotion, durationMs, easing } = useMobilePanelPresence(open);
  const surfaceRef = React.useRef<HTMLElement | null>(null);
  // A caller may clear its selected plan or project on close. Keep the last
  // displayed content intact for the exit, then unmount its effects below.
  const lastContent = React.useRef({ title, subtitle, ariaLabel, trailing, children });
  if (open) lastContent.current = { title, subtitle, ariaLabel, trailing, children };
  const displayed = lastContent.current;

  if (!rootRef.current) {
    rootRef.current = ensureSurfaceRoot();
  }

  useMobileModalFocus(surfaceRef, open && visible, disableEscapeDismiss ? null : onClose);

  if (!visible || !rootRef.current) return null;

  const isDialog = variant === 'dialog';

  const surface = (
    <section
      ref={surfaceRef}
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
      inert={!open}
      aria-label={displayed.ariaLabel}
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
        opacity: entered || reducedMotion ? 1 : 0,
        transform: entered || reducedMotion ? 'none' : 'scale(0.97)',
        transition: reducedMotion ? 'none' : `opacity ${durationMs}ms ${easing}, transform ${durationMs}ms ${easing}`,
        pointerEvents: open ? 'auto' : 'none',
      } : {
        paddingTop: 'var(--oc-safe-area-top, 0px)',
        // Push-style enter: slide in from the right edge; settled state drops
        // the transform entirely so the surface isn't kept on a compositing
        // layer (iOS clips those to the safe-area viewport).
        transform: entered || reducedMotion ? 'none' : 'translateX(100%)',
        transition: reducedMotion ? 'none' : `transform ${durationMs}ms ${easing}`,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {!headerless ? (
        <header
          className={cn(
            'oc-mobile-toolbar flex shrink-0 items-center gap-1 px-2',
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
            {displayed.title ? <h2 className="truncate typography-ui-header font-semibold text-foreground">{displayed.title}</h2> : null}
            {displayed.subtitle ? <p className="truncate typography-micro text-muted-foreground">{displayed.subtitle}</p> : null}
          </div>
          {displayed.trailing ? <div className="flex shrink-0 items-center gap-1.5">{displayed.trailing}</div> : null}
        </header>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        {displayed.children}
      </div>
    </section>
  );

  if (!isDialog) return createPortal(surface, rootRef.current);

  return createPortal(
    <div
      className="oc-keyboard-inset-surface fixed inset-0 z-50 flex items-center justify-center p-4"
      inert={!open}
      style={{
        background: 'color-mix(in srgb, var(--surface-overlay) 45%, transparent)',
        opacity: entered ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: reducedMotion ? 'none' : `opacity ${durationMs}ms ${easing}`,
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
