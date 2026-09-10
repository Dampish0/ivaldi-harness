import React from 'react';
import { cn, fuzzyMatch } from '@/lib/utils';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { useUIStore } from '@/stores/useUIStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useI18n } from '@/lib/i18n';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';

interface SkillInfo {
  name: string;
  scope: string;
  source?: string;
  description?: string;
}

export interface SkillAutocompleteHandle {
  handleKeyDown: (key: string) => void;
}

interface SkillAutocompleteProps {
  searchQuery: string;
  onSkillSelect: (skillName: string) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const SkillAutocomplete = React.forwardRef<SkillAutocompleteHandle, SkillAutocompleteProps>(({
  searchQuery,
  onSkillSelect,
  onClose,
  style,
}, ref) => {
  const { t } = useI18n();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const isMobile = useUIStore((state) => state.isMobile);
  const mobileMaxHeight = useMobileAutocompleteMaxHeight(containerRef, true, 240);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedIndexRef = React.useRef(0);
  const keyboardNavigationRef = React.useRef(false);
  const [filteredSkills, setFilteredSkills] = React.useState<SkillInfo[]>([]);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const skills = useSkillsStore((s) => s.skills);
  const loadSkills = useSkillsStore((s) => s.loadSkills);

  React.useEffect(() => {
    // Always trigger loadSkills when autocomplete opens to ensure project context is fresh
    void loadSkills();
  }, [loadSkills]);

  React.useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    const matches = normalizedQuery.length
      ? skills.filter((skill) => fuzzyMatch(skill.name, normalizedQuery))
      : skills;

    const sorted = [...matches].sort((a, b) => {
      // Sort by project scope first, then name
      if (a.scope === 'project' && b.scope !== 'project') return -1;
      if (a.scope !== 'project' && b.scope === 'project') return 1;
      return a.name.localeCompare(b.name);
    });

    setFilteredSkills(sorted);
    setSelectedIndex(0);
  }, [skills, searchQuery]);

  React.useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  React.useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedIndex]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      if (key === 'Escape') {
        onClose();
        return;
      }

      if (!filteredSkills.length) {
        return;
      }

      if (key === 'ArrowDown') {
        keyboardNavigationRef.current = true;
        setSelectedIndex((prev) => (prev + 1) % filteredSkills.length);
        return;
      }

      if (key === 'ArrowUp') {
        keyboardNavigationRef.current = true;
        setSelectedIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        const safeIndex = ((selectedIndexRef.current % filteredSkills.length) + filteredSkills.length) % filteredSkills.length;
        const skill = filteredSkills[safeIndex];
        if (skill) {
          onSkillSelect(skill.name);
        }
      }
    },
  }), [filteredSkills, onSkillSelect, onClose]);

  const renderSkill = (skill: SkillInfo, index: number) => {
    const source = skill.source || 'opencode';
    const isSelected = index === selectedIndex;
    return (
      <div
        key={`${skill.name}-${skill.scope}`}
        ref={(el) => {
          itemRefs.current[index] = el;
        }}
          className={cn(
            'flex cursor-pointer gap-2 rounded-md px-2.5 py-2 typography-ui-label transition-colors',
            isMobile ? 'items-center' : 'items-start',
            isSelected
              ? 'bg-interactive-selection text-interactive-selection-foreground'
              : 'text-foreground',
        )}
        onClick={() => onSkillSelect(skill.name)}
        onMouseMove={() => {
          keyboardNavigationRef.current = false;
          setSelectedIndex(index);
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{skill.name}</span>
            <span
              className={cn(
                'ml-auto flex shrink-0 items-center gap-1.5 typography-meta',
                isSelected
                  ? 'text-interactive-selection-foreground/70'
                  : 'text-muted-foreground',
              )}
            >
              <span>{skill.scope}</span>
              <span aria-hidden="true">·</span>
              <span>{source}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  const selectedSkill = filteredSkills[selectedIndex];

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 z-[100] mb-2 flex max-h-60 w-full min-w-0 max-w-[450px] flex-col overflow-hidden rounded-lg border border-[var(--interactive-border)]/70 bg-[var(--surface-elevated)] shadow-md"
      style={mobileMaxHeight !== undefined ? { ...style, maxHeight: mobileMaxHeight } : style}
    >
      <ScrollableOverlay preventOverscroll outerClassName="flex-1 min-h-0" className="p-1">
        {filteredSkills.length ? (
          <div>
            {filteredSkills.map((skill, index) => renderSkill(skill, index))}
          </div>
        ) : (
          <div className="px-3 py-2 typography-ui-label text-muted-foreground">
            {t('settings.skills.catalog.page.empty.noSkillsTitle')}
          </div>
        )}
      </ScrollableOverlay>
      {!isMobile && (
        <div className="border-t border-[var(--interactive-border)]/60">
          {selectedSkill?.description ? (
            <p className="line-clamp-3 px-3 pt-2 typography-meta text-muted-foreground">
              {selectedSkill.description}
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

SkillAutocomplete.displayName = 'SkillAutocomplete';
