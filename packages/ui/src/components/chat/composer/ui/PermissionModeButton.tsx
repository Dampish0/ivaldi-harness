import React from 'react';

import { Icon } from '@/components/icon/Icon';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/i18n';
import {
    PERMISSION_MODES,
    isPermissionModeSupported,
    permissionModeSchema,
    type PermissionMode,
    type PermissionModeCapabilities,
} from '@/lib/permissionModes';
import { cn } from '@/lib/utils';

type PermissionModeButtonProps = {
    footerIconButtonClass: string;
    iconSizeClass: string;
    isInteractive: boolean;
    mode: PermissionMode;
    capabilities: PermissionModeCapabilities;
    onModeChange: (mode: PermissionMode) => void;
    contextualVisibility?: boolean;
};

const iconForMode = (mode: PermissionMode): 'shield-user' | 'shield-check' => {
    if (mode === 'manual') return 'shield-user';
    return 'shield-check';
};

export const PermissionModeButton = React.memo(function PermissionModeButton(props: PermissionModeButtonProps) {
    const { t } = useI18n();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const {
        footerIconButtonClass,
        iconSizeClass,
        isInteractive,
        mode,
        capabilities,
        onModeChange,
        contextualVisibility = false,
    } = props;

    const label = t(`chat.permissionMode.${mode}.label`);
    const trigger = (
        <button
            type="button"
            className={cn(
                footerIconButtonClass,
                'rounded-md hover:bg-transparent',
                !isInteractive && 'opacity-30',
            )}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDownCapture={(event) => {
                if (event.pointerType === 'touch') {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }}
            disabled={!isInteractive}
            aria-label={t('chat.permissionMode.aria', { mode: label })}
            title={label}
        >
            <Icon
                name={iconForMode(mode)}
                className={cn(iconSizeClass, mode !== 'manual' && 'text-foreground')}
            />
        </button>
    );

    return (
        <span className={cn(
            mode !== 'manual' || !contextualVisibility || menuOpen
                ? 'inline-flex'
                : 'hidden group-hover/composer:inline-flex group-focus-within/composer:inline-flex',
        )}>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                    {trigger}
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-72">
                    <DropdownMenuLabel>{t('chat.permissionMode.title')}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(value) => {
                            const parsed = permissionModeSchema.safeParse(value);
                            if (parsed.success) onModeChange(parsed.data);
                        }}
                    >
                        {PERMISSION_MODES.map((candidate) => {
                            const supported = isPermissionModeSupported(candidate, capabilities);
                            return (
                                <DropdownMenuRadioItem
                                    key={candidate}
                                    value={candidate}
                                    disabled={!supported}
                                    className="items-start py-2"
                                >
                                    <div className="flex min-w-0 flex-col gap-0.5 pr-1">
                                        <span>{t(`chat.permissionMode.${candidate}.label`)}</span>
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {supported
                                                ? t(`chat.permissionMode.${candidate}.description`)
                                                : t('chat.permissionMode.unavailable')}
                                        </span>
                                    </div>
                                </DropdownMenuRadioItem>
                            );
                        })}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </span>
    );
});
