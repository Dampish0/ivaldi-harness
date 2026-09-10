import React from 'react';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { getModelDisplayName } from './mobileControlsUtils';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

interface MobileModelButtonProps {
    onOpenModel: () => void;
    className?: string;
}

export const MobileModelButton: React.FC<MobileModelButtonProps> = ({ onOpenModel, className }) => {
    const { t } = useI18n();
    const currentModelId = useConfigStore((state) => state.currentModelId);
    const currentProviderId = useConfigStore((state) => state.currentProviderId);
    const getCurrentProvider = useConfigStore((state) => state.getCurrentProvider);
    const currentProvider = getCurrentProvider();
    const modelLabel = getModelDisplayName(currentProvider, currentModelId, t('chat.modelControls.selectModel'));

    return (
        <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onOpenModel}
            // Same guard as PermissionAutoAcceptButton/MobileAgentButton: block
            // the focus transfer so the tap doesn't dismiss the keyboard. With
            // interactive-widget=resizes-content (Android), the keyboard-close
            // relayout moves this button mid-tap and the click never lands.
            onMouseDown={(event) => event.preventDefault()}
            onPointerDownCapture={(event) => {
                if (event.pointerType === 'touch') {
                    event.preventDefault();
                }
            }}
            className={cn(
                'min-w-0 justify-start rounded-md text-muted-foreground hover:text-foreground',
                className
            )}
            title={modelLabel}
        >
            <span className="flex min-w-0 items-center gap-1">
                {currentProviderId ? (
                    <ProviderLogo providerId={currentProviderId} className="size-3.5 flex-shrink-0" />
                ) : null}
                <span className="truncate">{modelLabel}</span>
            </span>
        </Button>
    );
};
