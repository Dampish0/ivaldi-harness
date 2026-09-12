import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Input } from '@/components/ui/input';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useI18n } from '@/lib/i18n';
import type { FileListEntry, FileSearchResult } from '@/lib/api/types';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useMobileBackHandler } from './mobileAppContext';

// The full desktop file editor, loaded on demand — it's a heavy chunk and only
// needed once a file is actually opened.
const LazyFilesEditor = React.lazy(() =>
  import('@/components/views/FilesView').then((module) => ({ default: module.FilesView })),
);

type MobileFilesRoute =
  | { type: 'browser'; directory: string }
  | { type: 'file'; path: string; returnDirectory: string };

const normalizePath = (value?: string | null): string => (value || '').replace(/\\/g, '/').replace(/\/+$/g, '');

const getNameFromPath = (path: string): string => {
  const normalized = normalizePath(path);
  if (!normalized || normalized === '/') return normalized || '/';
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized;
};

const getParentDirectory = (path: string): string | null => {
  const normalized = normalizePath(path);
  if (!normalized || normalized === '/') return null;
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return normalized.startsWith('/') ? '/' : null;
  return normalized.slice(0, index);
};

const getRelativePath = (path: string, root: string): string => {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot || normalizedPath === normalizedRoot) return getNameFromPath(normalizedPath);
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) return normalizedPath.slice(normalizedRoot.length + 1);
  return normalizedPath;
};

const formatFileSize = (size?: number): string => {
  if (size === undefined || !Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
    value /= 1024;
  }
  return '';
};

type MobileFilesSurfaceProps = {
  active?: boolean;
  /** When provided, the header gets a close X that calls this. */
  onClose?: () => void;
};

export const MobileFilesSurface: React.FC<MobileFilesSurfaceProps> = (props) => {
  const root = normalizePath(useEffectiveDirectory() ?? null);
  return <MobileFilesBrowser key={`${getRuntimeKey()}:${root}`} {...props} root={root} />;
};

type FileSearchState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; results: FileSearchResult[] }
  | { status: 'error' };

const MobileFilesBrowser: React.FC<MobileFilesSurfaceProps & { root: string }> = ({ onClose, active = true, root }) => {
  const { t } = useI18n();
  const { files } = useRuntimeAPIs();
  const setSelectedPath = useFilesViewTabsStore((state) => state.setSelectedPath);
  const [route, setRoute] = React.useState<MobileFilesRoute>(() => ({ type: 'browser', directory: root }));
  const [entries, setEntries] = React.useState<FileListEntry[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = React.useState(false);
  const [directoryError, setDirectoryError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [searchState, setSearchState] = React.useState<FileSearchState>({ status: 'idle' });
  const [searchRetry, setSearchRetry] = React.useState(0);
  const directoryLoadRequestIdRef = React.useRef(0);

  const currentDirectory = route.type === 'browser' ? route.directory : route.returnDirectory;

  const loadDirectory = React.useCallback(async (directory: string) => {
    if (!directory) return;
    const requestId = directoryLoadRequestIdRef.current + 1;
    directoryLoadRequestIdRef.current = requestId;
    setIsLoadingDirectory(true);
    setDirectoryError(null);
    setEntries([]);
    try {
      const result = await files.listDirectory(directory);
      if (directoryLoadRequestIdRef.current !== requestId) return;
      setEntries(result.entries.slice().sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
    } catch (error) {
      if (directoryLoadRequestIdRef.current !== requestId) return;
      setEntries([]);
      setDirectoryError(error instanceof Error ? error.message : t('mobile.files.error.listFailed'));
    } finally {
      if (directoryLoadRequestIdRef.current === requestId) {
        setIsLoadingDirectory(false);
      }
    }
  }, [files, t]);

  React.useEffect(() => {
    if (!active || route.type !== 'browser') return;
    void loadDirectory(route.directory);
    return () => { directoryLoadRequestIdRef.current += 1; };
  }, [active, loadDirectory, route]);

  React.useEffect(() => {
    if (!active || !root || route.type !== 'browser') return;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setSearchState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setSearchState({ status: 'loading' });
    const timeoutId = window.setTimeout(() => {
      void files.search({ directory: route.directory, query: normalizedQuery, maxResults: 40 })
        .then((results) => {
          if (!cancelled) setSearchState({ status: 'ready', results });
        })
        .catch(() => {
          if (!cancelled) setSearchState({ status: 'error' });
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [active, files, query, root, route, searchRetry]);

  const openDirectory = (directory: string) => {
    setQuery('');
    setSearchState({ status: 'idle' });
    setRoute({ type: 'browser', directory });
  };

  const rawParent = getParentDirectory(currentDirectory);
  const parentWithinRoot = currentDirectory !== root && rawParent !== null
    && (rawParent === root || rawParent.startsWith(`${root}/`));
  const parentDirectory = parentWithinRoot ? rawParent : null;
  const goBack = () => {
    if (route.type === 'file') {
      setRoute({ type: 'browser', directory: route.returnDirectory });
      return true;
    }
    if (query.trim()) {
      setQuery('');
      return true;
    }
    if (parentDirectory) {
      openDirectory(parentDirectory);
      return true;
    }
    return false;
  };
  useMobileBackHandler('workspace', active, goBack);

  const openFile = (path: string) => {
    // FilesView (editor-only) reads its target from the files-view tabs store.
    setSelectedPath(root, path);
    setRoute({ type: 'file', path, returnDirectory: currentDirectory || root });
  };

  // Chat tool rows (read/skill/edit) stage a pending file focus/navigation in
  // the UI store — the same channel desktop's context panel consumes. Route
  // straight to the editor for targets inside this workspace; the editor
  // itself consumes pendingFileNavigation to jump to the requested line.
  const pendingFileFocusPath = useUIStore((state) => state.pendingFileFocusPath);
  const pendingFileNavigation = useUIStore((state) => state.pendingFileNavigation);
  React.useEffect(() => {
    const target = normalizePath(pendingFileNavigation?.path ?? pendingFileFocusPath ?? '');
    if (!active || !target || !root) return;
    if (target !== root && !target.startsWith(`${root}/`)) return;
    setSelectedPath(root, target);
    setRoute({ type: 'file', path: target, returnDirectory: root });
    if (pendingFileFocusPath) useUIStore.getState().setPendingFileFocusPath(null);
  }, [active, pendingFileFocusPath, pendingFileNavigation, root, setSelectedPath]);

  if (!root) {
    return <MobileFilesState message={t('mobile.files.empty.noDirectory')} />;
  }

  if (route.type === 'file') {
    // Full desktop file editor (toolbar, dirty/save, wrap, search, md/html
    // preview, open-file tabs) — FilesView is already mobile-aware (keyboard
    // nudge, touch menus); this host only adds the back row.
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-2 border-b border-border/70 px-3 text-foreground">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1 size-9 shrink-0 text-muted-foreground"
            aria-label={t('header.actions.backAria')}
            onClick={goBack}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="arrow-left" className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate typography-ui-header text-foreground">{getNameFromPath(route.path)}</h2>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary>
            <React.Suspense fallback={<MobileFilesState loading message={t('filesView.state.loading')} />}>
              <LazyFilesEditor mode="editor-only" />
            </React.Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  const directoryLabel = route.directory === root ? t('mobile.files.rootDirectory') : getNameFromPath(route.directory);
  const canGoBack = parentWithinRoot && !query.trim();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      {(onClose || canGoBack) ? (
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border/60 px-2 text-foreground">
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={t('mobile.surface.closeAria')}
            onClick={onClose}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="close" className="size-4" />
          </Button>
        ) : null}
        {canGoBack && parentDirectory ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={t('mobile.files.backToParentAria', { name: getNameFromPath(parentDirectory) })}
            onClick={() => openDirectory(parentDirectory)}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="arrow-left" className="size-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate typography-ui-label text-foreground">{directoryLabel}</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          aria-label={t('mobile.files.refreshAria')}
          onClick={() => void loadDirectory(route.directory)}
          style={{ touchAction: 'manipulation' }}
        >
          <Icon name="refresh" className={cn('size-4', isLoadingDirectory && 'animate-spin')} />
        </Button>
      </header>
      ) : null}
      <div className="flex shrink-0 items-center gap-1 px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Icon name="search" className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('mobile.files.search.placeholder')}
            aria-label={t('mobile.files.search.placeholder')}
            className="min-h-11 rounded-md bg-transparent pl-8 pr-12 typography-meta ring-0 shadow-none hover:[&:not(:focus)]:bg-interactive-hover/30 focus:bg-[var(--surface-elevated)] focus:ring-1 focus:ring-[var(--interactive-focus-ring)]"
          />
          {query.trim() ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('sidebarFilesTree.search.clearAria')}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setQuery('')}
            >
              <Icon name="close" className="size-4" />
            </Button>
          ) : null}
        </div>
        {!canGoBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={t('mobile.files.refreshAria')}
            onClick={() => void loadDirectory(route.directory)}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="refresh" className={cn('size-4', isLoadingDirectory && 'animate-spin')} />
          </Button>
        ) : null}
      </div>

      <ScrollShadow className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {query.trim() ? (
          searchState.status === 'error' ? (
            <MobileFilesState message={t('mobile.files.error.searchFailed')} onRetry={() => setSearchRetry((value) => value + 1)} />
          ) : (
            <MobileSearchResults results={searchState.status === 'ready' ? searchState.results : []} isSearching={searchState.status !== 'ready'} onOpenFile={openFile} />
          )
        ) : directoryError ? (
          <MobileFilesState message={directoryError} onRetry={() => void loadDirectory(route.directory)} />
        ) : isLoadingDirectory ? (
          <MobileFilesState loading message={t('common.loading')} />
        ) : (
          <div className="flex flex-col gap-0.5">
            {entries.length === 0 && !isLoadingDirectory ? (
              <div className="px-4 py-8 text-center typography-body text-muted-foreground">{t('mobile.files.empty.directory')}</div>
            ) : null}
            {entries.map((entry) => (
              <MobileFileRow
                key={entry.path}
                name={entry.name}
                path={entry.path}
                directory={entry.isDirectory}
                meta={entry.isDirectory ? undefined : formatFileSize(entry.size)}
                onClick={() => entry.isDirectory ? openDirectory(entry.path) : openFile(entry.path)}
              />
            ))}
          </div>
        )}
      </ScrollShadow>
    </div>
  );
};

const MobileFileRow: React.FC<{
  name: string;
  path: string;
  directory: boolean;
  meta?: string;
  onClick: () => void;
}> = ({ name, path, directory, meta, onClick }) => (
  <button
    type="button"
    className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-interactive-hover/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--interactive-focus-ring)]"
    onClick={onClick}
    style={{ touchAction: 'manipulation' }}
  >
    {directory ? (
      <Icon name="folder-3" className="size-4 shrink-0 text-muted-foreground" />
    ) : (
      <FileTypeIcon filePath={path} className="size-4 shrink-0" />
    )}
    <span className="block min-w-0 flex-1 truncate typography-meta text-foreground">{name}</span>
    {meta ? <span className="shrink-0 typography-micro text-muted-foreground">{meta}</span> : null}
    {directory ? <Icon name="arrow-right-s" className="size-3.5 shrink-0 text-muted-foreground/60" /> : null}
  </button>
);

const MobileSearchResults: React.FC<{
  results: FileSearchResult[];
  isSearching: boolean;
  onOpenFile: (path: string) => void;
}> = ({ results, isSearching, onOpenFile }) => {
  const { t } = useI18n();
  const root = normalizePath(useEffectiveDirectory() ?? null);
  if (isSearching) return <MobileFilesState loading message={t('common.loading')} />;
  if (results.length === 0) return <MobileFilesState message={t('mobile.files.search.empty')} />;
  return (
    <div className="flex flex-col gap-0.5">
      {results.map((result) => (
        <MobileFileRow
          key={result.path}
          name={getNameFromPath(result.path)}
          path={result.path}
          directory={false}
          meta={getRelativePath(result.path, root)}
          onClick={() => onOpenFile(result.path)}
        />
      ))}
    </div>
  );
};


const MobileFilesState: React.FC<{ message: string; loading?: boolean; onRetry?: () => void }> = ({ message, loading = false, onRetry }) => {
  const { t } = useI18n();
  return (
  <div className="flex h-full items-center justify-center px-6 text-center">
    <div className="flex max-w-sm flex-col items-center gap-2">
      {loading ? <Icon name="loader-4" className="size-5 animate-spin text-muted-foreground" /> : <Icon name="folder-open" className="size-6 text-muted-foreground" />}
      <p className="typography-ui-label font-semibold text-foreground">{message}</p>
      {onRetry ? <Button type="button" variant="outline" onClick={onRetry}>{t('directoryExplorerDialog.browse.retry')}</Button> : null}
    </div>
  </div>
  );
};
