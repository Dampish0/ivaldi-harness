/**
 * The composer's footer row.
 *
 * Desktop lays it out as attachments and toggles on the left, model controls
 * and send on the right. Mobile Work keeps attachment, model and the primary
 * action in one row. Developer has its model and agent controls above it.
 *
 * The dictation component is rendered here on desktop only: on mobile it lives
 * at the composer wrapper level so a recording started from the collapsed pill
 * survives the expand.
 */

import React from 'react';

import { SessionGoalButton, SessionGoalObjectiveCounter } from '@/components/chat/SessionGoalButton';
import { ComposerDictation } from '@/components/dictation/ComposerDictation';
import { cn } from '@/lib/utils';
import { ModelControls } from '../../ModelControls';
import { ComposerActionButtons } from './ComposerActionButtons';
import { ComposerAttachmentControls } from './ComposerAttachmentControls';
import { PermissionModeButton } from './PermissionModeButton';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { isDictationCaptureSupported } from '@/lib/dictation/use-dictation-audio-source';
import type { PermissionMode, PermissionModeCapabilities } from '@/lib/permissionModes';
import { MobileModelButton } from '../../MobileModelButton';

const MemoModelControls = React.memo(ModelControls);
const MemoComposerDictation = React.memo(ComposerDictation);

export interface ComposerFooterProps {
    isMobile: boolean;
    isVSCode: boolean;
    sessionId: string | null;
    directory?: string;
    newSessionDraftOpen: boolean;
    messageLength: number;

    radius: string;
    footerPaddingClass: string;
    footerGapClass: string;
    footerIconButtonClass: string;
    iconSizeClass: string;
    sendIconSizeClass: string;
    stopIconSizeClass: string;

    canSend: boolean;
    canAbort: boolean;
    hasContent: boolean;
    permissionMode: PermissionMode;
    permissionModeCapabilities: PermissionModeCapabilities;
    isPermissionModeInteractive: boolean;
    dictationActive: boolean;

    onOpenSettings?: () => void;
    onOpenModel: () => void;
    onPickLocalFiles: () => void;
    onOpenIssuePicker: () => void;
    onOpenPrPicker: () => void;
    onOpenAttachSheet: () => void;
    onPermissionModeChange: (mode: PermissionMode) => void;
    onPrimaryAction: () => void;
    onQueueMessage: () => void;
    onAbort: () => void;
    onStartDictation: () => void;
    onDictationInsert: (text: string) => void;
    onDictationInsertAndSend: (text: string) => void;
    onDictationContentHeightChange: (height: number | null) => void;
}

export function ComposerFooter(props: ComposerFooterProps) {
    const isDeveloperMode = useProductModeStore((state) => state.mode === 'developer');
    const dictationEnabled = useConfigStore((state) => state.dictationEnabled);
    const [dictationCaptureSupported] = React.useState(() => isDictationCaptureSupported());
    const {
        isMobile,
        isVSCode,
        sessionId: currentSessionId,
        directory,
        newSessionDraftOpen,
        messageLength,
        radius: chatInputRadius,
        footerPaddingClass,
        footerGapClass,
        footerIconButtonClass,
        iconSizeClass,
        sendIconSizeClass,
        stopIconSizeClass,
        canSend,
        canAbort,
        hasContent,
        permissionMode,
        permissionModeCapabilities,
        isPermissionModeInteractive,
        dictationActive,
        onOpenSettings,
        onOpenModel,
        onPickLocalFiles,
        onOpenIssuePicker,
        onOpenPrPicker,
        onOpenAttachSheet,
        onPermissionModeChange,
        onPrimaryAction,
        onQueueMessage,
        onAbort,
        onStartDictation,
        onDictationInsert,
        onDictationInsertAndSend,
        onDictationContentHeightChange,
    } = props;
    const canStartDictation = !isVSCode && dictationEnabled && dictationCaptureSupported;

    return (
        <div
            className={cn(
                'bg-transparent flex-shrink-0',
                footerPaddingClass,
                isMobile ? 'composer-mobile-footer flex items-center gap-x-1.5' : cn('flex items-center justify-between', footerGapClass)
            )}
            style={{
                borderBottomLeftRadius: chatInputRadius,
                borderBottomRightRadius: chatInputRadius,
            }}
            data-chat-input-footer="true"
        >
            {isMobile ? (
                <>
                    <div className="flex w-full items-center justify-between gap-x-1.5">
                        <div className="composer-mobile-actions flex min-w-0 items-center gap-x-1 pl-1">
                            <ComposerAttachmentControls
                                isVSCode={isVSCode}
                                footerIconButtonClass={footerIconButtonClass}
                                iconSizeClass={iconSizeClass}
                                handlePickLocalFiles={onPickLocalFiles}
                                openIssuePicker={onOpenIssuePicker}
                                openPrPicker={onOpenPrPicker}
                                onOpenSettings={isDeveloperMode ? onOpenSettings : undefined}
                                onOpenMobileSheet={onOpenAttachSheet}
                            />
                            {!isDeveloperMode ? <MobileModelButton onOpenModel={onOpenModel} className="min-w-0 max-w-[52vw]" /> : null}
                            {isDeveloperMode ? <PermissionModeButton
                                footerIconButtonClass={footerIconButtonClass}
                                iconSizeClass={iconSizeClass}
                                isInteractive={isPermissionModeInteractive}
                                mode={permissionMode}
                                capabilities={permissionModeCapabilities}
                                onModeChange={onPermissionModeChange}
                            /> : null}
                            {isDeveloperMode ? (
                                <>
                                    <SessionGoalButton
                                        sessionId={currentSessionId}
                                        directory={directory}
                                        draftOpen={newSessionDraftOpen}
                                        footerIconButtonClass={footerIconButtonClass}
                                        iconSizeClass={iconSizeClass}
                                    />
                                    <SessionGoalObjectiveCounter length={messageLength} />
                                </>
                            ) : null}
                        </div>
                        <div className="flex items-center min-w-0 gap-x-1 justify-end">
                            <ComposerActionButtons
                                isMobile={isMobile}
                                footerIconButtonClass={footerIconButtonClass}
                                sendIconSizeClass={sendIconSizeClass}
                                stopIconSizeClass={stopIconSizeClass}
                                canSend={canSend}
                                canAbort={canAbort}
                                hasContent={hasContent}
                                canStartDictation={canStartDictation}
                                dictationActive={dictationActive}
                                currentSessionId={currentSessionId}
                                newSessionDraftOpen={newSessionDraftOpen}
                                onPrimaryAction={onPrimaryAction}
                                onStartDictation={onStartDictation}
                                onQueueMessage={onQueueMessage}
                                onAbort={onAbort}
                            />
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className={cn("flex items-center flex-shrink-0", footerGapClass)}>
                        <ComposerAttachmentControls
                            isVSCode={isVSCode}
                            footerIconButtonClass={footerIconButtonClass}
                            iconSizeClass={iconSizeClass}
                            handlePickLocalFiles={onPickLocalFiles}
                            openIssuePicker={onOpenIssuePicker}
                            openPrPicker={onOpenPrPicker}
                            onOpenSettings={isDeveloperMode ? onOpenSettings : undefined}
                        />
                        {isDeveloperMode ? (
                            <>
                                <PermissionModeButton
                                    footerIconButtonClass={footerIconButtonClass}
                                    iconSizeClass={iconSizeClass}
                                    isInteractive={isPermissionModeInteractive}
                                    mode={permissionMode}
                                    capabilities={permissionModeCapabilities}
                                    onModeChange={onPermissionModeChange}
                                    contextualVisibility
                                />
                                <SessionGoalButton
                                    sessionId={currentSessionId}
                                    directory={directory}
                                    draftOpen={newSessionDraftOpen}
                                    footerIconButtonClass={footerIconButtonClass}
                                    iconSizeClass={iconSizeClass}
                                    withTooltip
                                    contextualVisibility
                                />
                                <SessionGoalObjectiveCounter length={messageLength} />
                            </>
                        ) : (
                            <PermissionModeButton
                                footerIconButtonClass={footerIconButtonClass}
                                iconSizeClass={iconSizeClass}
                                isInteractive={isPermissionModeInteractive}
                                mode={permissionMode}
                                capabilities={permissionModeCapabilities}
                                onModeChange={onPermissionModeChange}
                                contextualVisibility
                            />
                        )}
                    </div>
                    <div className={cn('flex items-center flex-1 justify-end', footerGapClass, 'md:gap-x-3')}>
                        <MemoModelControls className={cn('flex-1 min-w-0 justify-end')} />
                        <MemoComposerDictation
                            radius={chatInputRadius}
                            isMobile={isMobile}
                            footerIconButtonClass={footerIconButtonClass}
                            footerPaddingClass={footerPaddingClass}
                            iconSizeClass={iconSizeClass}
                            sendIconSizeClass={sendIconSizeClass}
                            onInsert={onDictationInsert}
                            onInsertAndSend={onDictationInsertAndSend}
                            onContentHeightChange={onDictationContentHeightChange}
                            renderTrigger={false}
                        />
                        <ComposerActionButtons
                            isMobile={isMobile}
                            footerIconButtonClass={footerIconButtonClass}
                            sendIconSizeClass={sendIconSizeClass}
                            stopIconSizeClass={stopIconSizeClass}
                            canSend={canSend}
                            canAbort={canAbort}
                            hasContent={hasContent}
                            canStartDictation={canStartDictation}
                            dictationActive={dictationActive}
                            currentSessionId={currentSessionId}
                            newSessionDraftOpen={newSessionDraftOpen}
                            onPrimaryAction={onPrimaryAction}
                            onStartDictation={onStartDictation}
                            onQueueMessage={onQueueMessage}
                            onAbort={onAbort}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
