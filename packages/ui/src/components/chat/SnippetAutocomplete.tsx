import React from 'react';
import { cn, fuzzyMatch } from '@/lib/utils';
import { useSnippetsStore } from '@/stores/useSnippetsStore';
import { useUIStore } from '@/stores/useUIStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import type { Snippet } from '@/types/snippet';
import { useMobileAutocompleteMaxHeight } from './useMobileAutocompleteMaxHeight';

export interface SnippetAutocompleteHandle {
  handleKeyDown: (key: string) => void;
}

interface SnippetAutocompleteProps {
  searchQuery: string;
  onSnippetSelect: (snippet: Snippet, trigger: string) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

function snippetPreview(snippet: Snippet): string {
  return (snippet.description || snippet.content).replace(/\s+/g, ' ').trim().slice(0, 120);
}

export const SnippetAutocomplete = React.forwardRef<SnippetAutocompleteHandle, SnippetAutocompleteProps>(({
  searchQuery,
  onSnippetSelect,
  onClose,
  style,
}, ref) => {
  const { t } = useI18n();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const isMobile = useUIStore((state) => state.isMobile);
  const mobileMaxHeight = useMobileAutocompleteMaxHeight(containerRef, true, 240);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedIndexRef = React.useRef(0);
  const [filteredSnippets, setFilteredSnippets] = React.useState<Snippet[]>([]);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const snippets = useSnippetsStore((s) => s.snippets);
  const loadSnippets = useSnippetsStore((s) => s.loadSnippets);
  const setSnippetDraft = useSnippetsStore((s) => s.setSnippetDraft);
  const setSelectedSnippet = useSnippetsStore((s) => s.setSelectedSnippet);
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen);
  const setSettingsPage = useUIStore((s) => s.setSettingsPage);

  React.useEffect(() => {
    void loadSnippets();
  }, [loadSnippets]);

  React.useEffect(() => {
    const query = searchQuery.trim();
    const matches = query.length
      ? snippets.filter((snippet) => fuzzyMatch(snippet.name, query) || snippet.aliases.some((alias) => fuzzyMatch(alias, query)))
      : snippets;
    const sortedMatches = [...matches].sort((a, b) => {
      if (a.source === 'project' && b.source !== 'project') return -1;
      if (a.source !== 'project' && b.source === 'project') return 1;
      return a.name.localeCompare(b.name);
    });
    setFilteredSnippets(sortedMatches);
    setSelectedIndex(sortedMatches.length ? 1 : 0);
  }, [searchQuery, snippets]);

  React.useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  const chooseSnippet = React.useCallback((snippet: Snippet) => {
    const query = searchQuery.trim();
    const trigger = snippet.aliases.includes(query) ? query : snippet.name;
    onSnippetSelect(snippet, trigger);
  }, [onSnippetSelect, searchQuery]);

  const openNewSnippetSettings = React.useCallback(() => {
    const existing = new Set(snippets.map((snippet) => snippet.name));
    let name = 'new-snippet';
    let counter = 1;
    while (existing.has(name)) {
      name = `new-snippet-${counter++}`;
    }
    setSnippetDraft({ name, scope: 'global' });
    setSelectedSnippet(name);
    setSettingsPage('snippets');
    setSettingsDialogOpen(true);
    onClose();
  }, [onClose, setSelectedSnippet, setSettingsDialogOpen, setSettingsPage, setSnippetDraft, snippets]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      if (key === 'Escape') {
        onClose();
        return;
      }
      const itemCount = filteredSnippets.length + 1;
      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % itemCount);
        return;
      }
      if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + itemCount) % itemCount);
        return;
      }
      if (key === 'Enter' || key === 'Tab') {
        if (selectedIndexRef.current === 0) {
          openNewSnippetSettings();
          return;
        }
        const snippet = filteredSnippets[selectedIndexRef.current - 1];
        if (snippet) chooseSnippet(snippet);
      }
    },
  }), [chooseSnippet, filteredSnippets, onClose, openNewSnippetSettings]);

  return (
    <div ref={containerRef} className="absolute bottom-full left-0 z-[100] mb-2 flex max-h-60 w-full min-w-0 max-w-[450px] flex-col overflow-hidden rounded-lg border border-[var(--interactive-border)]/70 bg-[var(--surface-elevated)] shadow-md" style={mobileMaxHeight !== undefined ? { ...style, maxHeight: mobileMaxHeight } : style}>
      <ScrollableOverlay preventOverscroll outerClassName="flex-1 min-h-0" className="p-1">
        <div
          ref={(el) => { itemRefs.current[0] = el; }}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 typography-ui-label transition-colors',
            selectedIndex === 0
              ? 'bg-interactive-selection text-interactive-selection-foreground'
              : 'text-foreground',
          )}
          onClick={openNewSnippetSettings}
          onMouseMove={() => setSelectedIndex(0)}
        >
          <Icon name="add" className="size-3.5 text-current opacity-70" />
          <span className="font-medium">{t('chat.snippetAutocomplete.action.addNew')}</span>
        </div>
        {filteredSnippets.length ? filteredSnippets.map((snippet, index) => (
          <div
            key={`${snippet.source}:${snippet.filePath}`}
            ref={(el) => { itemRefs.current[index + 1] = el; }}
            className={cn(
              'flex cursor-pointer gap-2 rounded-md px-2.5 py-2 typography-ui-label transition-colors',
              isMobile ? 'items-center' : 'items-start',
              index + 1 === selectedIndex
                ? 'bg-interactive-selection text-interactive-selection-foreground'
                : 'text-foreground',
            )}
            onClick={() => chooseSnippet(snippet)}
            onMouseMove={() => setSelectedIndex(index + 1)}
          >
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">#{snippet.name}</span>
                <span
                  className={cn(
                    'ml-auto shrink-0 typography-meta',
                    index + 1 === selectedIndex
                      ? 'text-interactive-selection-foreground/70'
                      : 'text-muted-foreground',
                  )}
                >
                  {t(`snippets.source.${snippet.source}`)}
                </span>
              </div>
              {!isMobile && (
                <div
                  className={cn(
                    'mt-0.5 truncate typography-meta',
                    index + 1 === selectedIndex
                      ? 'text-interactive-selection-foreground/70'
                      : 'text-muted-foreground',
                  )}
                >
                  {snippetPreview(snippet)}
                </div>
              )}
            </div>
          </div>
        )) : (
          <div className="px-3 py-2 typography-ui-label text-muted-foreground">{t('chat.snippetAutocomplete.empty')}</div>
        )}
      </ScrollableOverlay>
      {!isMobile && (
        <div className="border-t border-[var(--interactive-border)]/60 px-3 py-1.5 typography-meta text-muted-foreground">{t('chat.snippetAutocomplete.footer')}</div>
      )}
    </div>
  );
});

SnippetAutocomplete.displayName = 'SnippetAutocomplete';
