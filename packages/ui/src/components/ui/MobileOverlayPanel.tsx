import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { ScrollableOverlay } from './ScrollableOverlay';
import { Icon } from "@/components/icon/Icon";
import { Button } from './button';
import { useMobileBackHandler } from '@/apps/mobileAppContext';
import { useMobileModalFocus } from '@/apps/useMobileModalFocus';
import { MOBILE_PANEL_EASING, useMobilePanelPresence } from '@/apps/useMobilePanelPresence';

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
const PANEL_DURATION_MS = 180;

const ensureOverlayRoot = () => {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(OVERLAY_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    document.body.appendChild(root);
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
  const { visible, entered, reducedMotion } = useMobilePanelPresence(open, PANEL_DURATION_MS);
  useMobileBackHandler('overlay', open, () => { onClose(); return true; });
  useMobileModalFocus(panelRef, open && visible, onClose);

  if (typeof document !== 'undefined' && !overlayRootRef.current) {
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
      aria-label={title}
      onClick={onClose}
      // The panel centers over the CHAT column, not the whole app: on a tablet
      // the shell keeps a persistent sessions sidebar, and a sheet centered on
      // the window reads as belonging to nothing. The shell publishes the
      // column's insets; on phones they are 0 and this is a no-op. The scrim
      // deliberately still covers everything.
      style={{
        background: 'color-mix(in srgb, var(--surface-overlay) 45%, transparent)',
        paddingLeft: 'var(--oc-chat-inset-left, 0px)',
        paddingRight: 'var(--oc-chat-inset-right, 0px)',
        opacity: entered ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: reducedMotion ? 'none' : `opacity ${PANEL_DURATION_MS}ms ${MOBILE_PANEL_EASING}`,
      }}
    >
        <div
          ref={panelRef}
          tabIndex={-1}
          aria-label={title}
          className={cn(
            'mt-auto flex max-h-[calc(100dvh-0.75rem)] min-h-0 w-full flex-col rounded-t-3xl bg-background shadow-none pwa-overlay-panel',
            'mx-auto max-w-lg',
            className
          )}
          style={{
            transform: entered || reducedMotion ? 'none' : 'translateY(16px)',
            transition: reducedMotion ? 'none' : `transform ${PANEL_DURATION_MS}ms ${MOBILE_PANEL_EASING}`,
            paddingBottom: 'var(--oc-safe-area-bottom, 0px)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
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

          if (renderHeader) {
            return renderHeader(closeButton);
          }

          return (
            <div className="flex items-center justify-between px-5 pb-1 pt-2">
              <h2 className="text-[18px] font-semibold text-foreground">{title}</h2>
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
          {children}
        </ScrollableOverlay>
        {footer ? (
          <div className="shrink-0 border-t border-border/40 px-3 py-2">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, overlayRootRef.current);
};
