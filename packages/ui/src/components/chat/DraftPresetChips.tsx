import React from 'react';
import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    useDroppable,
    closestCenter,
    MeasuringStrategy,
    type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '@/components/icon/Icon';
import {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
} from '@/components/ui/command';
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { useUIStore } from '@/stores/useUIStore';
import { useProductModeStore } from '@/stores/useProductModeStore';
import {
    useDraftStarters,
    type ResolvedStarter,
    type PinnableItem,
    type PinnableSection,
} from './useDraftStarters';

type DraftPresetChipsProps = {
    /** Called with the resolved starter invocation when a chip is clicked. */
    onSubmit: (starter: ResolvedStarter) => void;
    /** Extra classes for the wrapper (e.g. width/spacing per surface). */
    className?: string;
};

// Droppable id for the mobile "drag a chip here to delete" target. Kept distinct
// from any chip id (which are `group:type:name`) so collisions never alias.
const TRASH_DROPPABLE_ID = '__draft-starter-trash__';

// Shared box for the round icon buttons in the "+" slot (add picker and the
// mobile trash drop-zone). Identical so swapping one for the other never shifts
// layout or changes the circle size. shrink-0 keeps it from being compressed by
// the wrapping flex row.
const ROUND_ICON_BUTTON_CLASS =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent transition-colors';

const PICKER_SECTIONS: { key: PinnableSection; headingKey: 'chat.draftStarters.sectionBuiltIn' | 'chat.draftStarters.sectionCommands' | 'chat.draftStarters.sectionSkills' }[] = [
    { key: 'built-in', headingKey: 'chat.draftStarters.sectionBuiltIn' },
    { key: 'command', headingKey: 'chat.draftStarters.sectionCommands' },
    { key: 'skill', headingKey: 'chat.draftStarters.sectionSkills' },
];

const SortableChip: React.FC<{
    item: ResolvedStarter;
    onSubmit: (starter: ResolvedStarter) => void;
    onRemove: () => void;
    /** Hide the per-chip hover "x" (mobile uses the trash drop-zone instead). */
    hideRemove?: boolean;
}> = ({ item, onSubmit, onRemove, hideRemove }) => {
    const { t } = useI18n();
    const isWorkMode = useProductModeStore((state) => state.mode === 'work');
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

    return (
        <div
            ref={setNodeRef}
            // Translate only (no scaleX/scaleY) so the lifted chip keeps its own
            // width instead of stretching to the target slot.
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn('group/chip relative max-w-full', isDragging && 'z-10 opacity-60')}
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                onClick={() => onSubmit(item)}
                className="group inline-flex max-w-full touch-none select-none items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--interactive-hover)] hover:text-foreground"
            >
                <Icon name={item.icon} className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
                <span className="truncate whitespace-nowrap">{item.label}</span>
            </button>
            {hideRemove ? null : (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    aria-label={isWorkMode ? t('chat.work.draftStarters.remove') : t('chat.draftStarters.remove')}
                    title={isWorkMode ? t('chat.work.draftStarters.remove') : t('chat.draftStarters.remove')}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-border bg-[var(--surface-elevated)] text-muted-foreground shadow-sm hover:text-foreground group-hover/chip:flex"
                >
                    <Icon name="close" className="h-2.5 w-2.5" />
                </button>
            )}
        </div>
    );
};

const StarterGroup: React.FC<{
    items: ResolvedStarter[];
    onSubmit: (starter: ResolvedStarter) => void;
    onRemove: (item: ResolvedStarter) => void;
    hideRemove?: boolean;
}> = ({ items, onSubmit, onRemove, hideRemove }) => (
    <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        {items.map((item) => (
            <SortableChip
                key={item.id}
                item={item}
                onSubmit={onSubmit}
                onRemove={() => onRemove(item)}
                hideRemove={hideRemove}
            />
        ))}
    </SortableContext>
);

/**
 * Mobile delete target. Sits in the "+" slot and is only mounted while a chip is
 * being dragged; dropping a chip on it removes that starter. Styled to match the
 * add ("+") button so the swap reads as the same affordance toggling purpose.
 */
const TrashDropZone: React.FC = () => {
    const { t } = useI18n();
    const isWorkMode = useProductModeStore((state) => state.mode === 'work');
    const { currentTheme } = useThemeSystem();
    const { setNodeRef, isOver } = useDroppable({ id: TRASH_DROPPABLE_ID });

    return (
        <button
            type="button"
            ref={setNodeRef}
            aria-label={isWorkMode ? t('chat.work.draftStarters.remove') : t('chat.draftStarters.remove')}
            title={isWorkMode ? t('chat.work.draftStarters.remove') : t('chat.draftStarters.remove')}
            // Same box as the "+" button so the swap never shifts layout; on-hover
            // feedback is color-only (no resize).
            className={cn(
                ROUND_ICON_BUTTON_CLASS,
                isOver ? 'border-destructive text-destructive' : 'text-muted-foreground',
            )}
            style={{
                backgroundColor: currentTheme?.colors?.surface?.elevated,
                borderColor: isOver ? undefined : currentTheme?.colors?.interactive?.border,
            }}
        >
            <Icon name="delete-bin" className="h-4 w-4" />
        </button>
    );
};

const StarterPickerList: React.FC<{
    pinnable: PinnableItem[];
    onPick: (item: PinnableItem) => void;
    className?: string;
}> = ({ pinnable, onPick, className }) => {
    const { t } = useI18n();
    const isWorkMode = useProductModeStore((state) => state.mode === 'work');
    const headingForSection = (section: (typeof PICKER_SECTIONS)[number]) => {
        if (!isWorkMode) {
            return t(section.headingKey);
        }
        switch (section.key) {
            case 'built-in': return t('chat.work.draftStarters.sectionBuiltIn');
            case 'command': return t('chat.work.draftStarters.sectionCommands');
            case 'skill': return t('chat.work.draftStarters.sectionSkills');
        }
    };
    return (
        <Command className={cn('min-h-0', className)}>
            <CommandInput placeholder={isWorkMode ? t('chat.work.draftStarters.searchPlaceholder') : t('chat.draftStarters.searchPlaceholder')} />
            <CommandList>
                <CommandEmpty>{isWorkMode ? t('chat.work.draftStarters.empty') : t('chat.draftStarters.empty')}</CommandEmpty>
                {PICKER_SECTIONS.map((section) => {
                    const list = pinnable.filter((item) => item.section === section.key);
                    if (list.length === 0) return null;
                    return (
                        <CommandGroup key={section.key} heading={headingForSection(section)}>
                            {list.map((item) => (
                                <CommandItem
                                    key={`${item.type}:${item.name}`}
                                    value={`${item.section} ${item.label} ${item.name}`}
                                    onSelect={() => onPick(item)}
                                >
                                    {/* No per-row icon: the section heading already conveys the type. */}
                                    <span className="truncate">{item.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    );
                })}
            </CommandList>
        </Command>
    );
};

const AddStarterPicker: React.FC<{
    pinnable: PinnableItem[];
    onOpen: () => void;
    onAdd: (item: PinnableItem) => void;
}> = ({ pinnable, onOpen, onAdd }) => {
    const { t } = useI18n();
    const { isMobile } = useDeviceInfo();
    const isWorkMode = useProductModeStore((state) => state.mode === 'work');
    const [open, setOpen] = React.useState(false);
    const addLabel = isWorkMode ? t('chat.work.draftStarters.add') : t('chat.draftStarters.add');

    if (isMobile) return (
        <>
            <button type="button" aria-label={addLabel} onClick={() => { setOpen(true); onOpen(); }} className={cn(ROUND_ICON_BUTTON_CLASS, 'text-muted-foreground hover:bg-interactive-hover')}>
                <Icon name="add" className="size-4" />
            </button>
            <MobileOverlayPanel open={open} onClose={() => setOpen(false)} title={addLabel}>
                <StarterPickerList pinnable={pinnable} onPick={(item) => { onAdd(item); setOpen(false); }} className="flex max-h-[60vh] flex-col" />
            </MobileOverlayPanel>
        </>
    );

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) onOpen();
            }}
        >
            <DialogTrigger asChild>
                <button
                    type="button"
                    aria-label={addLabel}
                    title={addLabel}
                    className={cn(ROUND_ICON_BUTTON_CLASS, 'text-muted-foreground hover:bg-[var(--interactive-hover)] hover:text-foreground')}
                >
                    <Icon name="add" className="h-4 w-4" />
                </button>
            </DialogTrigger>
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
                <DialogHeader className="px-4 pb-2 pt-4 text-left">
                    <DialogTitle>{addLabel}</DialogTitle>
                </DialogHeader>
                <StarterPickerList
                    pinnable={pinnable}
                    onPick={(item) => { onAdd(item); setOpen(false); }}
                    className="flex max-h-[60vh] flex-col"
                />
            </DialogContent>
        </Dialog>
    );
};

/**
 * The editable row of starter chips on the draft welcome screen. Shows the
 * global group then the project group (each reorderable within itself), plus a
 * "+" picker to pin existing commands/skills. The surface owns how a chip click
 * is submitted via `onSubmit`.
 *
 * Both groups share a single DndContext so the mobile trash drop-zone (which
 * replaces the "+" while dragging) is reachable from either group's drag.
 * Reorder is constrained to within a chip's own group; cross-group hovers are
 * ignored.
 */
const DraftPresetChipsContent: React.FC<DraftPresetChipsProps> = ({ onSubmit, className }) => {
    const { t } = useI18n();
    const { global, project, pinnable, ensureLoaded, addStarter, removeStarter, reorder } = useDraftStarters();
    const { isMobile } = useDeviceInfo();
    const [isDragging, setIsDragging] = React.useState(false);
    const [showAll, setShowAll] = React.useState(false);
    const submitFromChooser = (starter: ResolvedStarter) => {
        setShowAll(false);
        onSubmit(starter);
    };

    const sensors = useSensors(
        // Desktop: start dragging after a small move so a click still submits.
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        // Touch: long-press to drag (tap submits, a quick swipe scrolls instead).
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    );

    const chipById = React.useCallback(
        (id: string): ResolvedStarter | undefined =>
            global.find((i) => i.id === id) ?? project.find((i) => i.id === id),
        [global, project],
    );

    const handleDragStart = () => setIsDragging(true);
    const handleDragCancel = () => setIsDragging(false);
    const handleDragEnd = (event: DragEndEvent) => {
        setIsDragging(false);
        const { active, over } = event;
        if (!over) return;
        const activeId = String(active.id);
        const chip = chipById(activeId);
        if (!chip) return;
        if (String(over.id) === TRASH_DROPPABLE_ID) {
            removeStarter(chip.group, chip.ref);
            return;
        }
        const overId = String(over.id);
        if (activeId === overId) return;
        const overChip = chipById(overId);
        // Reorder only within the same group; ignore cross-group hovers.
        if (overChip && overChip.group === chip.group) {
            reorder(chip.group, activeId, overId);
        }
    };

    const editableStarters = (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            // The trash drop-zone mounts on drag start, so re-measure droppables
            // while dragging or it never registers a rect to drop onto.
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={handleDragStart}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
            <div className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}>
                {global.length > 0 ? (
                    <StarterGroup
                        items={global}
                        onSubmit={submitFromChooser}
                        onRemove={(item) => removeStarter('global', item.ref)}
                        hideRemove={isMobile}
                    />
                ) : null}
                {project.length > 0 ? (
                    <StarterGroup
                        items={project}
                        onSubmit={submitFromChooser}
                        onRemove={(item) => removeStarter('project', item.ref)}
                        hideRemove={isMobile}
                    />
                ) : null}
                {isMobile && isDragging ? (
                    <TrashDropZone />
                ) : (
                    <AddStarterPicker pinnable={pinnable} onOpen={ensureLoaded} onAdd={addStarter} />
                )}
            </div>
        </DndContext>
    );

    if (!isMobile) return editableStarters;

    return (
        <>
            <div className={cn('flex flex-wrap items-center justify-center gap-2', className)}>
                {[...global, ...project].slice(0, 2).map((item) => (
                    <button key={item.id} type="button" onClick={() => onSubmit(item)} className="inline-flex min-h-12 max-w-full items-center gap-2 rounded-full border border-border/50 px-3 typography-ui-label text-muted-foreground hover:bg-interactive-hover">
                        <Icon name={item.icon} className="size-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                    </button>
                ))}
                <button type="button" onClick={() => setShowAll(true)} className="min-h-12 rounded-full px-3 typography-ui-label text-muted-foreground hover:bg-interactive-hover">
                    {t('inlineComment.actions.showMore')}
                </button>
            </div>
            <MobileOverlayPanel open={showAll} onClose={() => setShowAll(false)} title={t('chat.work.draftStarters.sectionBuiltIn')}>
                {editableStarters}
            </MobileOverlayPanel>
        </>
    );
};

export const DraftPresetChips: React.FC<DraftPresetChipsProps> = (props) => {
    const visible = useUIStore((state) => state.draftStartersVisible);
    return visible ? <DraftPresetChipsContent {...props} /> : null;
};
