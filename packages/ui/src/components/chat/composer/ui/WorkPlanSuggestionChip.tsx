import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

interface WorkPlanSuggestionChipProps {
    visible: boolean;
    onApply: () => void;
    className?: string;
}

export const WorkPlanSuggestionChip: React.FC<WorkPlanSuggestionChipProps> = React.memo(({
    visible,
    onApply,
    className,
}) => {
    const { t } = useI18n();
    if (!visible) return null;

    return (
        <div className={`flex items-center ${className ?? ''}`}>
            <Button
                variant="chip"
                size="xs"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onApply}
                aria-label={t('chat.commandAutocomplete.command.featurePlanDescription')}
                title={t('chat.commandAutocomplete.command.featurePlanDescription')}
                className="rounded-full text-muted-foreground hover:text-foreground"
            >
                <Icon name="survey" className="size-3.5" />
                /plan
            </Button>
        </div>
    );
});

WorkPlanSuggestionChip.displayName = 'WorkPlanSuggestionChip';
