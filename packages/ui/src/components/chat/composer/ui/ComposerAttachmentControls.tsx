/**
 * Attachment and settings controls in the composer footer.
 *
 * Rendered twice on mobile — once in the collapsed pill, once in the expanded
 * footer — so it stays a memoized component with an explicit comparator: a
 * re-render of the whole composer must not tear down the dropdown while it is
 * open.
 */

import React from 'react';

import { Icon } from '@/components/icon/Icon';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useProductModeStore } from '@/stores/useProductModeStore';

type ComposerAttachmentControlsProps = {
    isVSCode: boolean;
    footerIconButtonClass: string;
    iconSizeClass: string;
    handlePickLocalFiles: () => void;
    openIssuePicker: () => void;
    openPrPicker: () => void;
    onOpenSettings?: () => void;
    onMenuOpenChange?: (open: boolean) => void;
    /** Mobile: open the attachment bottom sheet instead of the dropdown menu. */
    onOpenMobileSheet?: () => void;
    /** Desktop: show the shared tooltip instead of the native title. */
    withTooltip?: boolean;
};

const ControlTooltip = ({ enabled, label, children }: { enabled: boolean; label: string; children: React.ReactElement }) => {
    if (!enabled) return children;
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
        </Tooltip>
    );
};

export const ComposerAttachmentControls = React.memo(function ComposerAttachmentControls(props: ComposerAttachmentControlsProps) {
    const { t } = useI18n();
    const isDeveloperMode = useProductModeStore((state) => state.mode === 'developer');
    const {
        isVSCode,
        footerIconButtonClass,
        iconSizeClass,
        handlePickLocalFiles,
        openIssuePicker,
        openPrPicker,
        onOpenSettings,
        withTooltip = false,
    } = props;
    const addAttachmentLabel = t('chat.chatInput.actions.addAttachment');
    const attachFilesLabel = t('chat.chatInput.actions.attachFiles');
    const modelAgentSettingsLabel = t('chat.chatInput.actions.modelAgentSettings');

    return (
        <div className="flex items-center gap-x-1.5">
            <div className="relative inline-flex">
                {props.onOpenMobileSheet ? (
                    <button
                        type="button"
                        className={footerIconButtonClass}
                        onClick={props.onOpenMobileSheet}
                        // Same guard as PermissionAutoAcceptButton: keep the tap
                        // from dismissing the keyboard. On Android's
                        // resizes-content viewport the keyboard-close relayout
                        // moves this button mid-tap and the click never lands.
                        onMouseDown={(event) => event.preventDefault()}
                        onPointerDownCapture={(event) => {
                            if (event.pointerType === 'touch') {
                                event.preventDefault();
                            }
                        }}
                        title={t('chat.chatInput.actions.addAttachment')}
                        aria-label={t('chat.chatInput.actions.addAttachment')}
                    >
                        <Icon name="add-circle" className={cn(iconSizeClass, 'text-current')} />
                    </button>
                ) : isVSCode ? (
                    <ControlTooltip enabled={withTooltip} label={attachFilesLabel}>
                        <button
                            type="button"
                            className={footerIconButtonClass}
                            onClick={handlePickLocalFiles}
                            {...(withTooltip ? {} : { title: attachFilesLabel })}
                            aria-label={attachFilesLabel}
                        >
                            <Icon name="attachment-2" className={cn(iconSizeClass, 'text-current')} />
                        </button>
                    </ControlTooltip>
                ) : (
                    <DropdownMenu onOpenChange={props.onMenuOpenChange}>
                        <ControlTooltip enabled={withTooltip} label={addAttachmentLabel}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className={footerIconButtonClass}
                                    {...(withTooltip ? {} : { title: addAttachmentLabel })}
                                    aria-label={addAttachmentLabel}
                                >
                                    <Icon name="add-circle" className={cn(iconSizeClass, 'text-current')} />
                                </button>
                            </DropdownMenuTrigger>
                        </ControlTooltip>
                        <DropdownMenuContent side="top" align="start">
                            <DropdownMenuItem
                                onSelect={() => {
                                    requestAnimationFrame(handlePickLocalFiles);
                                }}
                            >
                                <Icon name="attachment-2"/>
                                {attachFilesLabel}
                            </DropdownMenuItem>
                            {isDeveloperMode ? (
                                <>
                                    <DropdownMenuItem
                                        onSelect={() => {
                                            requestAnimationFrame(openIssuePicker);
                                        }}
                                    >
                                        <Icon name="github"/>
                                        {t('chat.chatInput.actions.linkGithubIssue')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onSelect={() => {
                                            requestAnimationFrame(openPrPicker);
                                        }}
                                    >
                                        <Icon name="git-pull-request"/>
                                        {t('chat.chatInput.actions.linkGithubPr')}
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {isDeveloperMode && onOpenSettings ? (
                <ControlTooltip enabled={withTooltip} label={modelAgentSettingsLabel}>
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        className={footerIconButtonClass}
                        {...(withTooltip ? {} : { title: modelAgentSettingsLabel })}
                        aria-label={modelAgentSettingsLabel}
                    >
                        <Icon name="ai-agent" className={cn(iconSizeClass, 'text-current')} />
                    </button>
                </ControlTooltip>
            ) : null}
        </div>
    );
}, (prev, next) => (
    prev.isVSCode === next.isVSCode
    && prev.footerIconButtonClass === next.footerIconButtonClass
    && prev.iconSizeClass === next.iconSizeClass
    && prev.onOpenSettings === next.onOpenSettings
    && prev.onMenuOpenChange === next.onMenuOpenChange
    && prev.onOpenMobileSheet === next.onOpenMobileSheet
    && prev.withTooltip === next.withTooltip
));
