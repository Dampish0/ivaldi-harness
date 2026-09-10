/**
 * The composer's send / queue / stop control.
 *
 * Which one is shown depends on whether a turn is running: idle sends, a busy
 * session with content offers both queue (above) and stop, a busy session
 * without content offers only stop.
 */

import React from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { StopIcon } from '@/components/icons/StopIcon';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type ComposerActionButtonsProps = {
    isMobile: boolean;
    footerIconButtonClass: string;
    sendIconSizeClass: string;
    stopIconSizeClass: string;
    canSend: boolean;
    canAbort: boolean;
    hasContent: boolean;
    canStartDictation: boolean;
    dictationActive: boolean;
    currentSessionId: string | null;
    newSessionDraftOpen: boolean;
    onPrimaryAction: () => void;
    onStartDictation: () => void;
    onQueueMessage: () => void;
    onAbort: () => void;
};

export const ComposerActionButtons = React.memo(function ComposerActionButtons(props: ComposerActionButtonsProps) {
    const {
        isMobile,
        footerIconButtonClass,
        sendIconSizeClass,
        stopIconSizeClass,
        canSend,
        canAbort,
        hasContent,
        canStartDictation,
        dictationActive,
        currentSessionId,
        newSessionDraftOpen,
        onPrimaryAction,
        onStartDictation,
        onQueueMessage,
        onAbort,
    } = props;
    const { t } = useI18n();
    const hasDestination = Boolean(currentSessionId || newSessionDraftOpen);

    const sendButton = (
        <Button
            type={isMobile ? 'button' : 'submit'}
            size="icon"
            variant="ghost"
            disabled={!canSend || !hasDestination}
            onClick={(event) => {
                if (!isMobile) return;
                event.preventDefault();
                onPrimaryAction();
            }}
            className={cn(
                'mr-0.5 size-8 -translate-y-px rounded-full supports-[corner-shape:squircle]:rounded-full',
                canSend && hasDestination
                    ? 'bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80'
                    : 'bg-interactive-hover text-muted-foreground opacity-30',
            )}
            aria-label={t('chat.chatInput.actions.sendMessageAria')}
        >
            <Icon name="arrow-up" className={cn(sendIconSizeClass)} />
        </Button>
    );

    if (!canAbort) {
        if (!hasContent && canStartDictation && hasDestination) {
            return (
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={dictationActive}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDownCapture={(event) => {
                        if (event.pointerType === 'touch') event.preventDefault();
                    }}
                    onClick={(event) => {
                        if (isMobile) event.preventDefault();
                        onStartDictation();
                    }}
                    className="mr-0.5 size-8 -translate-y-px rounded-full bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80 supports-[corner-shape:squircle]:rounded-full"
                    title={t('chat.dictation.start')}
                    aria-label={t('chat.dictation.start')}
                >
                    <Icon name="mic" className={cn(sendIconSizeClass)} />
                </Button>
            );
        }
        return sendButton;
    }

    return (
        <div className="relative mr-0.5 -translate-y-px">
            {hasContent ? (
                <button
                    type="button"
                    disabled={!currentSessionId}
                    onClick={(event) => {
                        if (isMobile) {
                            event.preventDefault();
                        }
                        onQueueMessage();
                    }}
                    className={cn(
                        footerIconButtonClass,
                        'absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1',
                        currentSessionId ? 'text-primary hover:text-primary' : 'opacity-30'
                    )}
                    aria-label={t('chat.chatInput.actions.queueMessageAria')}
                >
                    <Icon name="send-plane-2" className={cn(sendIconSizeClass, '-rotate-90')} />
                </button>
            ) : null}
            <Button
                type="button"
                size="icon"
                variant="destructive"
                onClick={onAbort}
                className="size-8 rounded-full supports-[corner-shape:squircle]:rounded-full"
                aria-label={t('chat.chatInput.actions.stopGeneratingAria')}
            >
                <StopIcon className={cn(stopIconSizeClass)} />
            </Button>
        </div>
    );
}, (prev, next) => (
    prev.isMobile === next.isMobile
    && prev.footerIconButtonClass === next.footerIconButtonClass
    && prev.sendIconSizeClass === next.sendIconSizeClass
    && prev.stopIconSizeClass === next.stopIconSizeClass
    && prev.canSend === next.canSend
    && prev.canAbort === next.canAbort
    && prev.hasContent === next.hasContent
    && prev.canStartDictation === next.canStartDictation
    && prev.dictationActive === next.dictationActive
    && prev.currentSessionId === next.currentSessionId
    && prev.newSessionDraftOpen === next.newSessionDraftOpen
    && prev.onPrimaryAction === next.onPrimaryAction
    && prev.onStartDictation === next.onStartDictation
    && prev.onQueueMessage === next.onQueueMessage
    && prev.onAbort === next.onAbort
));
