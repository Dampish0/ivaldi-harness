/**
 * The collapsed mobile composer.
 *
 * With the keyboard down the composer collapses to a compact input surface:
 * attachments, a one-line preview of the draft, and the same primary action
 * slot as the full composer.
 * Tapping anywhere in it expands the real composer and raises the keyboard in
 * the same gesture — which is why the expand handler must run synchronously
 * from the tap rather than from an effect.
 *
 * New chats are started from the session list, alongside existing chats.
 */

import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { StopIcon } from '@/components/icons/StopIcon';
import { SessionGoalRow } from '@/components/chat/SessionGoalRow';
import { SessionSuggestionChip } from '@/components/chat/SessionSuggestionChip';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ComposerAttachmentControls } from './ComposerAttachmentControls';
import { WorkPlanSuggestionChip } from './WorkPlanSuggestionChip';
import { Button } from '@/components/ui/button';
import { useConfigStore } from '@/stores/useConfigStore';
import { isDictationCaptureSupported } from '@/lib/dictation/use-dictation-audio-source';

export interface MobilePillComposerProps {
    message: string;
    sessionId: string | null;
    directory?: string;
    newSessionDraftOpen: boolean;
    hasContent: boolean;
    isVSCode: boolean;
    canAbort: boolean;
    canSend: boolean;
    footerIconButtonClass: string;
    iconSizeClass: string;
    stopIconSizeClass: string;
    onExpand: () => void;
    onApplySuggestion: (text: string) => void;
    showPlanSuggestion: boolean;
    onApplyPlanSuggestion: () => void;
    onPickLocalFiles: () => void;
    onOpenIssuePicker: () => void;
    onOpenPrPicker: () => void;
    onOpenAttachSheet: () => void;
    onPrimaryAction: () => void;
    onStartDictation: () => void;
    onAbort: () => void;
}

export function MobilePillComposer(props: MobilePillComposerProps) {
    const { t } = useI18n();
    const dictationEnabled = useConfigStore((state) => state.dictationEnabled);
    const [dictationCaptureSupported] = React.useState(() => isDictationCaptureSupported());
    const {
        message,
        sessionId: currentSessionId,
        directory,
        newSessionDraftOpen,
        hasContent,
        isVSCode,
        canAbort,
        canSend,
        footerIconButtonClass,
        iconSizeClass,
        stopIconSizeClass,
        onExpand,
        onApplySuggestion,
        showPlanSuggestion,
        onApplyPlanSuggestion,
        onPickLocalFiles,
        onOpenIssuePicker,
        onOpenPrPicker,
        onOpenAttachSheet,
        onPrimaryAction,
        onStartDictation,
        onAbort,
    } = props;
    const hasDestination = Boolean(currentSessionId || newSessionDraftOpen);
    const canStartDictation = !isVSCode && dictationEnabled && dictationCaptureSupported && hasDestination;

    return (
        <div className="flex flex-col">
        <SessionGoalRow
            sessionId={currentSessionId}
            directory={directory}
            className="mb-1.5"
        />
        <SessionSuggestionChip
            sessionId={currentSessionId}
            directory={directory}
            hidden={hasContent || newSessionDraftOpen}
            onApply={onApplySuggestion}
            className="mb-1.5"
        />
        <WorkPlanSuggestionChip
            visible={showPlanSuggestion}
            onApply={onApplyPlanSuggestion}
            className="mb-1.5 px-1"
        />
        <div className="flex items-center gap-2">
            <div
                data-mobile-composer-pill="true"
                className="flex min-h-14 min-w-0 flex-1 items-center gap-x-0.5 rounded-full border border-border/50 bg-[var(--surface-elevated)] py-1 pl-1.5 pr-1 focus-within:ring-1 focus-within:ring-[var(--interactive-focus-ring)]"
            >
                <ComposerAttachmentControls
                    isVSCode={isVSCode}
                    footerIconButtonClass={footerIconButtonClass}
                    iconSizeClass={iconSizeClass}
                    handlePickLocalFiles={onPickLocalFiles}
                    openIssuePicker={onOpenIssuePicker}
                    openPrPicker={onOpenPrPicker}
                    onOpenMobileSheet={onOpenAttachSheet}
                />
                <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 cursor-text items-center px-2 text-left"
                    onClick={onExpand}
                >
                    <span
                        className={cn(
                            'truncate typography-ui-label',
                            message.trim() ? 'text-foreground' : 'text-muted-foreground',
                        )}
                    >
                        {message.trim()
                            ? message
                            : currentSessionId || newSessionDraftOpen
                                ? t('mobile.composer.prompt')
                                : t('chat.chatInput.placeholder.selectSession')}
                    </span>
                </button>
                {canAbort ? (
                    <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="size-9 rounded-full"
                        // The pill shows only while the keyboard is down — the
                        // tap must abort in place, never focus/expand the
                        // composer or raise the keyboard.
                        onMouseDown={(event) => event.preventDefault()}
                        onPointerDownCapture={(event) => {
                            if (event.pointerType === 'touch') {
                                event.preventDefault();
                            }
                        }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onAbort();
                        }}
                        title={t('chat.chatInput.actions.stopGeneratingAria')}
                        aria-label={t('chat.chatInput.actions.stopGeneratingAria')}
                    >
                        <StopIcon className={cn(stopIconSizeClass)} />
                    </Button>
                ) : hasContent && hasDestination ? (
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-9 rounded-full bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onPrimaryAction();
                        }}
                        aria-label={t('chat.chatInput.actions.sendMessageAria')}
                        disabled={!canSend}
                    >
                        <Icon name="arrow-up" className="size-4" />
                    </Button>
                ) : canStartDictation ? (
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-9 rounded-full bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onStartDictation();
                        }}
                        title={t('chat.dictation.start')}
                        aria-label={t('chat.dictation.start')}
                    >
                        <Icon name="mic" className="size-4" />
                    </Button>
                ) : null}
            </div>
        </div>
        </div>
    );
}
