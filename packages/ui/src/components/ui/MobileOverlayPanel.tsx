import React from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls } from 'motion/react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { ScrollableOverlay } from './ScrollableOverlay';
import { Icon } from "@/components/icon/Icon";
import { Button } from './button';
import { useMobileBackHandler } from '@/apps/mobileAppContext';
import { useMobileModalFocus } from '@/apps/useMobileModalFocus';
import { useMobilePanelPresence } from '@/apps/useMobilePanelPresence';

interface MobileOverlayPanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentMaxHeightClassName?: string;
  renderHeader?: (closeButton: React.ReactNode) => React.ReactNode;
}

const OVERLAY_ROOT_ID = 'mobile-overlay-root';

const ensureOverlayRoot = () => {
  const ownerDocument = globalThis.document;
  if (!ownerDocument) return null;
  let root = ownerDocument.getElementById(OVERLAY_ROOT_ID);
  if (!root) {
    root = ownerDocument.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    ownerDocument.body.appendChild(root);
  }
  return root;
};

export const MobileOverlayPanel: React.FC<MobileOverlayPanelProps> = ({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  contentMaxHeightClassName,
  renderHeader,
}) => {
  const { t } = useI18n();
  const overlayRootRef = React.useRef<HTMLElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const dragControls = useDragControls();
  const lastContent = React.useRef({ title, children, footer, renderHeader });
  if (open) lastContent.current = { title, children, footer, renderHeader };
  const displayed = lastContent.current;
  const { visible, entered, reducedMotion, durationMs, easing } = useMobilePanelPresence(open);
  useMobileBackHandler('overlay', open, () => { onClose(); return true; });
  useMobileModalFocus(panelRef, open && visible, onClose);

  if (globalThis.document && !overlayRootRef.current) {
    overlayRootRef.current = ensureOverlayRoot();
  }

  // Synchronous close signal: this layout-effect cleanup runs inside the same
  // React flush as the user click that closed the panel, so listeners (e.g.
  // the keyboard-restore in ChatInput) can refocus an input while iOS still
  // considers the gesture active — a deferred focus() would not raise the
  // keyboard in an installed PWA.
  React.useLayoutEffect(() => {
    if (!open) return;
    window.dispatchEvent(new Event('oc:mobile-overlay-opened'));
    return () => {
      window.dispatchEvent(new Event('oc:mobile-overlay-closed'));
    };
  }, [open]);

  if (!visible || !overlayRootRef.current) {
    return null;
  }

  const contentMaxHeight = contentMaxHeightClassName ?? 'max-h-[min(70vh,520px)]';

  const content = (
    <div
      className={cn(
        'oc-keyboard-inset-surface oc-keyboard-inset-snap fixed inset-0 z-[60] flex flex-col',
      )}
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
      inert={!open}
      aria-label={displayed.title}
      onClick={onClose}
      // The panel centers over the CHAT column, not the whole app: on a tablet
      // the shell keeps a persistent sessions sidebar, and a sheet centered on
      // the window reads as belonging to nothing. The shell publishes the
      // column's insets; on phones they are 0 and this is a no-op. The scrim
      // deliberately still covers everything.
      style={{
        paddingLeft: 'var(--oc-chat-inset-left, 0px)',
        paddingRight: 'var(--oc-chat-inset-right, 0px)',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
        <div aria-hidden="true" className="absolute inset-0" style={{
          background: 'color-mix(in srgb, var(--surface-overlay) 45%, transparent)',
          opacity: entered ? 1 : 0,
          transition: reducedMotion ? 'none' : `opacity ${durationMs}ms ${easing}`,
        }} />
        <motion.div
          ref={panelRef}
          tabIndex={-1}
          aria-label={displayed.title}
          className={cn(
            'relative mt-auto flex max-h-[calc(100dvh-0.75rem)] min-h-0 w-full flex-col rounded-t-3xl bg-background shadow-none pwa-overlay-panel',
            'mx-auto max-w-lg',
            className
          )}
          initial={false} animate={{ y: entered || reducedMotion ? 0 : '100%' }}
          transition={{ duration: reducedMotion ? 0 : durationMs / 1000, ease: [0.22, 1, 0.36, 1] }}
          drag={reducedMotion ? false : 'y'} dragListener={false} dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 1 }} dragMomentum={false}
          onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 500) onClose(); }}
          style={{
            transform: reducedMotion ? 'none' : undefined,
            paddingBottom: 'var(--oc-safe-area-bottom, 0px)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
        <div aria-hidden="true" className="flex h-6 shrink-0 items-center justify-center" style={{ touchAction: 'none' }} onPointerDown={(event) => dragControls.start(event)}>
          <span className="h-1 w-8 rounded-full bg-[var(--interactive-border)]" />
        </div>
        {(() => {
          const closeButton = (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-8 rounded-md text-muted-foreground hover:text-foreground"
              aria-label={t('mobile.surface.closeAria')}
            >
              <Icon name="close" className="h-4 w-4" />
            </Button>
          );

          if (displayed.renderHeader) {
            return displayed.renderHeader(closeButton);
          }

          return (
            <div className="flex items-center justify-between px-5 pb-1 pt-2">
              <h2 className="min-w-0 typography-ui-header font-semibold text-foreground">{displayed.title}</h2>
              {closeButton}
            </div>
          );
        })()}
        <ScrollableOverlay
          useScrollShadow
          disableHorizontal
          // Contain the scroll inside the panel: without this, iOS chains the
          // rubber-band overscroll to the page behind the sheet, which reads
          // as a weird content bounce while scrolling the overlay.
          preventOverscroll
          outerClassName={cn('min-h-0 flex-1', contentMaxHeight)}
          className="px-2 py-2 pwa-overlay-scroll"
        >
          {displayed.children}
        </ScrollableOverlay>
        {displayed.footer ? (
          <div className="shrink-0 border-t border-border/40 px-3 py-2">
            {displayed.footer}
          </div>
        ) : null}
      </motion.div>
    </div>
  );

  return createPortal(content, overlayRootRef.current);
};
