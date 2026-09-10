import React from 'react';
import { cn, fuzzyMatch } from '@/lib/utils';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionMessages } from '@/sync/sync-context';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';
import { commandMatchesSearch, mergeCommandAutocompleteItems } from './commandAutocompleteItems';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { isComposerCommandVisibleInProductMode } from '@/lib/productMode';

type CommandSource = 'openchamber' | 'opencode' | 'skill';

export interface CommandInfo {
  id: string;
  name: string;
  source: CommandSource;
  description?: string;
  searchAliases?: string[];
  agent?: string;
  model?: string;
  isBuiltIn?: boolean;
  isOpenChamber?: boolean;
  isSkill?: boolean;
  scope?: string;
}

export interface CommandAutocompleteHandle {
  handleKeyDown: (key: string) => void;
}

interface CommandAutocompleteProps {
  searchQuery: string;
  onCommandSelect: (command: CommandInfo) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const CommandAutocomplete = React.forwardRef<CommandAutocompleteHandle, CommandAutocompleteProps>(({
  searchQuery,
  onCommandSelect,
  onClose,
  style,
}, ref) => {
  const { t } = useI18n();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const sessionMessages = useSessionMessages(currentSessionId ?? '');
  const hasMessagesInCurrentSession = sessionMessages.length > 0;
  const hasSession = Boolean(currentSessionId);
  const hasNewSessionDraft = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open));
  const canStartSessionCommand = hasSession || hasNewSessionDraft;
  const productMode = useProductModeStore((state) => state.mode);
  const isMobile = useUIStore((state) => state.isMobile);
  const canUseReviewHandoffFlow = hasSession && !isMobile && !isVSCodeRuntime();
  const canUseWorkGoalCommand = productMode === 'work' && canStartSessionCommand && !isVSCodeRuntime();

  const [commands, setCommands] = React.useState<CommandInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const commandsWithMetadata = useCommandsStore((s) => s.commands);
  const refreshCommands = useCommandsStore((s) => s.loadCommands);
  const skills = useSkillsStore((s) => s.skills);
  const refreshSkills = useSkillsStore((s) => s.loadSkills);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedIndexRef = React.useRef(0);
  const keyboardNavigationRef = React.useRef(false);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mobileMaxHeight = useMobileAutocompleteMaxHeight(containerRef, true);
  const ignoreClickRef = React.useRef(false);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = React.useRef(false);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) {
        return;
      }
      if (containerRef.current.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  React.useEffect(() => {
    // Force refresh to get latest project context when mounting
    void refreshCommands();
    void refreshSkills();
  }, [refreshCommands, refreshSkills]);

  React.useEffect(() => {
    const loadCommands = async () => {
      setLoading(true);
      try {
        const skillNames = new Set(skills.map((skill) => skill.name));
        const customCommands: CommandInfo[] = commandsWithMetadata.map((cmd, index) => ({
          id: `opencode:${cmd.scope ?? 'global'}:${cmd.name}:${cmd.agent ?? ''}:${cmd.model ?? ''}:${index}`,
          name: cmd.name,
          source: 'opencode',
          description: cmd.description,
          agent: cmd.agent ?? undefined,
          model: cmd.model ?? undefined,
          isBuiltIn: cmd.name === 'init' || cmd.name === 'review',
          isSkill: cmd.source === 'skill' || skillNames.has(cmd.name),
          scope: cmd.scope,
        }));
        const skillCommands: CommandInfo[] = skills.map((skill, index) => ({
          id: `skill:${skill.scope}:${skill.source ?? 'opencode'}:${skill.name}:${index}`,
          name: skill.name,
          source: 'skill',
          description: skill.description,
          isSkill: true,
          scope: skill.scope,
        }));

        const builtInCommands: CommandInfo[] = [
          ...(hasSession && !hasMessagesInCurrentSession
            ? [{ id: 'openchamber:init', name: 'init', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.initDescription'), isBuiltIn: true }]
            : []
          ),
          ...(hasSession  // Show when session exists, not when hasMessages
            ? [
                { id: 'openchamber:undo', name: 'undo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.undoDescription'), isBuiltIn: true },
                { id: 'openchamber:redo', name: 'redo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.redoDescription'), isBuiltIn: true },
                { id: 'openchamber:timeline', name: 'timeline', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.timelineDescription'), isBuiltIn: true },
              ]
            : []
          ),
          { id: 'openchamber:compact', name: 'compact', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.compactDescription'), isBuiltIn: true },
          ...(hasSession
            ? [{ id: 'openchamber:btw', name: 'btw', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.btwDescription'), isOpenChamber: true }]
            : []
          ),
          ...(hasSession
            ? [{ id: 'openchamber:summary', name: 'summary', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.summaryDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:workspace-review', name: 'workspace-review', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.workspaceReviewDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canUseReviewHandoffFlow
            ? [{ id: 'openchamber:handoff-review', name: 'handoff-review', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.handoffReviewDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:plan', name: 'plan', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.featurePlanDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canUseWorkGoalCommand
            ? [{ id: 'openchamber:goal', name: 'goal', source: 'openchamber' as const, description: t('chat.goal.button.armAria'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:craft-goal', name: 'craft-goal', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.craftGoalDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:schedule-task', name: 'schedule-task', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.scheduleTaskDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:catch-up', name: 'catch-up', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.catchUpDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:debug', name: 'debug', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.debugDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:weigh', name: 'weigh', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.weighDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:explore', name: 'explore', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.exploreDescription'), isOpenChamber: true }]
            : []
          ),
        ];
        const allCommands = mergeCommandAutocompleteItems(builtInCommands, customCommands, skillCommands);

        const allowInitCommand = !hasMessagesInCurrentSession;
        const filtered = (searchQuery
          ? allCommands.filter(cmd => commandMatchesSearch(cmd, searchQuery))
          : allCommands).filter(cmd => (
            (allowInitCommand || cmd.name !== 'init')
            && isComposerCommandVisibleInProductMode(productMode, cmd.name)
          ));

        filtered.sort((a, b) => {
          const aStartsWith = a.name.toLowerCase().startsWith(searchQuery.toLowerCase());
          const bStartsWith = b.name.toLowerCase().startsWith(searchQuery.toLowerCase());
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          return a.name.localeCompare(b.name);
        });

        setCommands(filtered);
      } catch {

        const allowInitCommand = !hasMessagesInCurrentSession;
        const builtInCommands: CommandInfo[] = [
          ...(hasSession && !hasMessagesInCurrentSession
            ? [{ id: 'openchamber:init', name: 'init', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.initDescription'), isBuiltIn: true }]
            : []
          ),
          ...(hasSession  // Show when session exists, not when hasMessages
            ? [
                { id: 'openchamber:undo', name: 'undo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.undoDescription'), isBuiltIn: true },
                { id: 'openchamber:redo', name: 'redo', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.redoDescription'), isBuiltIn: true },
                { id: 'openchamber:timeline', name: 'timeline', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.timelineDescription'), isBuiltIn: true },
              ]
            : []
          ),
          { id: 'openchamber:compact', name: 'compact', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.compactDescription'), isBuiltIn: true },
          ...(hasSession
            ? [{ id: 'openchamber:btw', name: 'btw', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.btwDescription'), isOpenChamber: true }]
            : []
          ),
          ...(hasSession
            ? [{ id: 'openchamber:summary', name: 'summary', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.summaryDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:workspace-review', name: 'workspace-review', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.workspaceReviewDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canUseReviewHandoffFlow
            ? [{ id: 'openchamber:handoff-review', name: 'handoff-review', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.handoffReviewDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:plan', name: 'plan', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.featurePlanDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canUseWorkGoalCommand
            ? [{ id: 'openchamber:goal', name: 'goal', source: 'openchamber' as const, description: t('chat.goal.button.armAria'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:craft-goal', name: 'craft-goal', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.craftGoalDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:schedule-task', name: 'schedule-task', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.scheduleTaskDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:catch-up', name: 'catch-up', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.catchUpDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:debug', name: 'debug', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.debugDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:weigh', name: 'weigh', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.weighDescription'), isOpenChamber: true }]
            : []
          ),
          ...(canStartSessionCommand
            ? [{ id: 'openchamber:explore', name: 'explore', source: 'openchamber' as const, description: t('chat.commandAutocomplete.command.exploreDescription'), isOpenChamber: true }]
            : []
          ),
        ];

        const filtered = (searchQuery
          ? builtInCommands.filter(cmd =>
              fuzzyMatch(cmd.name, searchQuery) ||
              (cmd.description && fuzzyMatch(cmd.description, searchQuery))
            )
          : builtInCommands).filter(cmd => (
            (allowInitCommand || cmd.name !== 'init')
            && isComposerCommandVisibleInProductMode(productMode, cmd.name)
          ));

        setCommands(filtered);
      } finally {
        setLoading(false);
      }
    };

    loadCommands();
  }, [searchQuery, hasMessagesInCurrentSession, hasSession, canStartSessionCommand, canUseReviewHandoffFlow, canUseWorkGoalCommand, commandsWithMetadata, productMode, skills, t]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [commands]);

  React.useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  React.useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      block: 'nearest'
    });
  }, [selectedIndex]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      const total = commands.length;
      if (key === 'Escape') {
        onClose();
        return;
      }

      if (total === 0) {
        return;
      }

      if (key === 'ArrowDown') {
        keyboardNavigationRef.current = true;
        setSelectedIndex((prev) => (prev + 1) % total);
        return;
      }

      if (key === 'ArrowUp') {
        keyboardNavigationRef.current = true;
        setSelectedIndex((prev) => (prev - 1 + total) % total);
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        const safeIndex = ((selectedIndexRef.current % total) + total) % total;
        const command = commands[safeIndex];
        if (command) {
          onCommandSelect(command);
        }
      }
    }
  }), [commands, onClose, onCommandSelect]);

  const getCommandIcon = (command: CommandInfo, selected: boolean) => {
    const iconClassName = cn(
      'size-3.5',
      selected ? 'text-interactive-selection-foreground' : 'text-muted-foreground',
    );
    switch (command.name) {
      case 'init':
        return <Icon name="file" className={iconClassName} />;
      case 'undo':
        return <Icon name="arrow-go-back" className={iconClassName} />;
      case 'redo':
        return <Icon name="arrow-go-forward" className={iconClassName} />;
      case 'timeline':
        return <Icon name="time" className={iconClassName} />;
      case 'compact':
        return <Icon name="scissors" className={iconClassName} />;
      case 'goal':
        return <Icon name="target" className={iconClassName} />;
      case 'review':
        return <Icon name="search-eye" className={iconClassName} />;
      case 'test':
      case 'build':
      case 'run':
        return <Icon name="terminal-box" className={iconClassName} />;
      default:
        if (command.isBuiltIn) {
          return <Icon name="flashlight" className={iconClassName} />;
        }
        return <Icon name="command" className={iconClassName} />;
    }
  };

  const selectedCommand = commands[selectedIndex];

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 z-[100] mb-2 flex max-h-64 w-full min-w-0 max-w-[450px] flex-col overflow-hidden rounded-lg border border-[var(--interactive-border)]/70 bg-[var(--surface-elevated)] shadow-md"
      style={mobileMaxHeight !== undefined ? { ...style, maxHeight: mobileMaxHeight } : style}
    >
      <ScrollableOverlay preventOverscroll outerClassName="flex-1 min-h-0" className="p-1">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div>
            {commands.map((command, index) => {
              const isSystem = command.isBuiltIn;
              const isOpenChamberBadge = command.isOpenChamber;
              const isSelected = index === selectedIndex;
              const metadata = [
                command.isSkill ? t('chat.commandAutocomplete.badge.skill') : null,
                isOpenChamberBadge
                  ? 'Ivaldi'
                  : isSystem
                    ? t('chat.commandAutocomplete.badge.system')
                    : command.scope ?? null,
                command.agent ?? null,
              ].filter((item): item is string => Boolean(item));

              return (
                <div
                  key={command.id}
                  ref={(el) => { itemRefs.current[index] = el; }}
                  className={cn(
                    'flex cursor-pointer gap-2.5 rounded-md px-2.5 py-2 transition-colors',
                    isMobile ? "items-center" : "items-start",
                    isSelected
                      ? 'bg-interactive-selection text-interactive-selection-foreground'
                      : 'text-foreground',
                  )}
                  // Block the focus transfer the tap would perform: the textarea
                  // must stay focused so selecting a command doesn't dismiss the
                  // soft keyboard (the blur raced the keyboard-hide trigger and
                  // won against the deferred refocus).
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) => {
                    if (event.pointerType !== 'touch') {
                      return;
                    }
                    pointerStartRef.current = { x: event.clientX, y: event.clientY };
                    pointerMovedRef.current = false;
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType !== 'touch' || !pointerStartRef.current) {
                      return;
                    }
                    const dx = event.clientX - pointerStartRef.current.x;
                    const dy = event.clientY - pointerStartRef.current.y;
                    if (Math.hypot(dx, dy) > 6) {
                      pointerMovedRef.current = true;
                    }
                  }}
                  onPointerUp={(event) => {
                    if (event.pointerType !== 'touch') {
                      return;
                    }
                    const didMove = pointerMovedRef.current;
                    pointerStartRef.current = null;
                    pointerMovedRef.current = false;
                    if (didMove) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    ignoreClickRef.current = true;
                    onCommandSelect(command);
                  }}
                  onPointerCancel={() => {
                    pointerStartRef.current = null;
                    pointerMovedRef.current = false;
                  }}
                  onClick={() => {
                    if (ignoreClickRef.current) {
                      ignoreClickRef.current = false;
                      return;
                    }
                    onCommandSelect(command);
                  }}
                  onMouseMove={() => {
                    keyboardNavigationRef.current = false;
                    setSelectedIndex(index);
                  }}
                >
                  <div className={cn(!isMobile && "mt-0.5")}>
                    {getCommandIcon(command, isSelected)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="typography-ui-label font-medium">/{command.name}</span>
                      {metadata.length > 0 ? (
                        <span
                          className={cn(
                            'ml-auto flex min-w-0 shrink-0 items-center gap-1.5 typography-meta',
                            isSelected
                              ? 'text-interactive-selection-foreground/70'
                              : 'text-muted-foreground',
                          )}
                        >
                          {metadata.map((item, metadataIndex) => (
                            <React.Fragment key={`${item}-${metadataIndex}`}>
                              {metadataIndex > 0 ? <span aria-hidden="true">·</span> : null}
                              <span className="max-w-28 truncate">{item}</span>
                            </React.Fragment>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {commands.length === 0 && (
              <div className="px-3 py-2 typography-ui-label text-muted-foreground">
                {t('chat.commandAutocomplete.empty')}
              </div>
            )}
          </div>
        )}
      </ScrollableOverlay>
      {!isMobile && (
        <div className="border-t border-[var(--interactive-border)]/60">
          {selectedCommand?.description ? (
            <p className="line-clamp-2 px-3 pt-2 typography-meta text-muted-foreground">
              {selectedCommand.description}
            </p>
          ) : null}
          <div className="px-3 py-1.5 typography-meta text-muted-foreground">
            {t('chat.autocomplete.keyboardHint')}
          </div>
        </div>
      )}
    </div>
  );
});

CommandAutocomplete.displayName = 'CommandAutocomplete';
