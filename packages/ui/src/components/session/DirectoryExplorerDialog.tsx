import React from 'react';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useFileSystemAccess } from '@/hooks/useFileSystemAccess';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui';
import { IdentityDropdown } from '@/components/views/git/GitHeader';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useDeviceInfo, useTabletLayout } from '@/lib/device';
import { useHardwareKeyboard } from '@/lib/hardwareKeyboard';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { Icon } from "@/components/icon/Icon";
import { opencodeClient } from '@/lib/opencode/client';
import { useI18n } from '@/lib/i18n';
import { formatShortcutForDisplay } from '@/lib/shortcuts';
import {
  isFilesystemError,
  type FilesystemErrorReason,
} from '@/lib/api/files-errors';

interface DirectoryExplorerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const filesystemHomeSchema = z.object({ home: z.string().trim().min(1) });
const projectFolderNameSchema = z.string().trim().min(1).max(255).refine((name) => (
  !/[\\/:*?"<>|]/.test(name)
  && !Array.from(name).some((character) => character.charCodeAt(0) < 32)
  && !name.endsWith('.')
  && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
));

type BrowseEntry = {
  name: string;
  path: string;
};

type BrowseRow =
  | { type: 'up'; value: 'browse:up'; name: string; path: string | null; added?: false }
  | { type: 'directory'; value: string; name: string; path: string; added: boolean };

const isRootPath = (value: string): boolean => value === '/';

const normalizeSeparators = (value: string): string => value.replace(/\\/g, '/');

const trimTrailingSeparators = (value: string): string => {
  if (!value || isRootPath(value)) return value;
  let result = value;
  while (result.length > 1 && result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
};

const hasTrailingPathSeparator = (value: string): boolean => value.endsWith('/');

const ensureBrowseDirectoryPath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || hasTrailingPathSeparator(trimmed)) return trimmed;
  return `${trimmed}/`;
};

const getLastPathSeparatorIndex = (value: string): number => value.lastIndexOf('/');

const getBrowseDirectoryPath = (value: string): string => {
  if (hasTrailingPathSeparator(value)) return value;
  const lastSeparator = getLastPathSeparatorIndex(value);
  if (lastSeparator < 0) return value;
  return value.slice(0, lastSeparator + 1);
};

const getBrowseLeafPathSegment = (value: string): string => {
  const lastSeparator = getLastPathSeparatorIndex(value);
  return value.slice(lastSeparator + 1);
};

const getBrowseParentPath = (value: string): string | null => {
  const trimmed = trimTrailingSeparators(value.trim());
  if (!trimmed || trimmed === '~' || trimmed === '~/' || trimmed === '/') return null;
  const lastSeparator = getLastPathSeparatorIndex(trimmed);
  if (lastSeparator < 0) return null;
  if (trimmed.startsWith('~/') && lastSeparator <= 1) return '~/';
  if (lastSeparator === 0) return '/';
  return `${trimmed.slice(0, lastSeparator)}/`;
};

const canNavigateUp = (value: string): boolean => hasTrailingPathSeparator(value) && getBrowseParentPath(value) !== null;

const appendBrowsePathSegment = (currentPath: string, segment: string): string => (
  `${getBrowseDirectoryPath(currentPath)}${segment}/`
);

const normalizeDirectoryPath = (path: string | null | undefined): string | null => {
  if (!path) return null;
  const normalized = trimTrailingSeparators(normalizeSeparators(path.trim()));
  if (!normalized) return null;
  return normalized.toLowerCase();
};

const displayPathToAbsolutePath = (value: string, homeDirectory: string): string => {
  const trimmed = value.trim();
  if (trimmed === '~') return homeDirectory;
  if (trimmed.startsWith('~/')) return `${homeDirectory}${trimmed.slice(1)}`;
  return trimmed;
};

const isPrimaryModifierPressed = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
  const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
};

const focusPathInput = (input: HTMLInputElement | null): void => {
  if (!input) return;
  input.focus({ preventScroll: true });
  const valueLength = input.value.length;
  input.setSelectionRange(valueLength, valueLength);
  input.scrollLeft = input.scrollWidth;
};

const resolveFreshFilesystemHome = async (): Promise<string | null> => {
  try {
    const response = await runtimeFetch('/api/fs/home', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = filesystemHomeSchema.parse(await response.json());
      return normalizeSeparators(data.home);
    }
  } catch {
    // Fall back to the client helper below.
  }

  return opencodeClient.getFilesystemHome().catch(() => null);
};

export const DirectoryExplorerDialog: React.FC<DirectoryExplorerDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useI18n();
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory);
  const projects = useProjectsStore((s) => s.projects);
  const addProject = useProjectsStore((s) => s.addProject);
  const setSessionSwitcherOpen = useUIStore((s) => s.setSessionSwitcherOpen);
  const openNewSessionDraft = useSessionUIStore((s) => s.openNewSessionDraft);
  const gitIdentityProfiles = useGitIdentitiesStore((s) => s.profiles);
  const globalGitIdentity = useGitIdentitiesStore((s) => s.globalIdentity);
  const defaultGitIdentityId = useGitIdentitiesStore((s) => s.defaultGitIdentityId);
  const loadGitIdentityProfiles = useGitIdentitiesStore((s) => s.loadProfiles);
  const loadGlobalGitIdentity = useGitIdentitiesStore((s) => s.loadGlobalIdentity);
  const loadDefaultGitIdentityId = useGitIdentitiesStore((s) => s.loadDefaultGitIdentityId);
  const { canRequestAccess, requestAccess, startAccessing } = useFileSystemAccess();
  const { isMobile } = useDeviceInfo();
  const { enabled: isTabletLayout } = useTabletLayout();
  const hasHardwareKeyboard = useHardwareKeyboard();
  const useMobileSheet = isMobile && !isTabletLayout;
  const isDeveloperMode = useProductModeStore((state) => state.mode === 'developer');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [dialogHomeDirectory, setDialogHomeDirectory] = React.useState('');
  const [query, setQuery] = React.useState('~/');
  const [entries, setEntries] = React.useState<BrowseEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isBrowseDirectoryMissing, setIsBrowseDirectoryMissing] = React.useState(false);
  const [browseErrorReason, setBrowseErrorReason] = React.useState<FilesystemErrorReason | null>(null);
  const [browseReloadKey, setBrowseReloadKey] = React.useState(0);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isOpeningPicker, setIsOpeningPicker] = React.useState(false);
  const [isCloneMode, setIsCloneMode] = React.useState(false);
  const [cloneRemoteUrl, setCloneRemoteUrl] = React.useState('');
  const [selectedGitIdentityId, setSelectedGitIdentityId] = React.useState<string | null>(null);
  const [showHidden, setShowHidden] = React.useState(false);
  const [workProjectKind, setWorkProjectKind] = React.useState<'existing' | 'new'>('existing');
  const [projectName, setProjectName] = React.useState('');
  const [showWorkBrowser, setShowWorkBrowser] = React.useState(false);
  const [hasChosenWorkFolder, setHasChosenWorkFolder] = React.useState(false);
  const [loadedBrowsePath, setLoadedBrowsePath] = React.useState('');
  const projectNameId = React.useId();

  const explorerRootDirectory = dialogHomeDirectory || homeDirectory;

  const addedProjectPaths = React.useMemo(() => new Set(
    projects
      .map((project) => normalizeDirectoryPath(project.path))
      .filter((path): path is string => Boolean(path))
  ), [projects]);

  React.useEffect(() => {
    if (!open) return;
    setQuery('~/');
    setEntries([]);
    setHighlightedIndex(0);
    setIsConfirming(false);
    setIsOpeningPicker(false);
    setIsCloneMode(false);
    setCloneRemoteUrl('');
    setSelectedGitIdentityId(null);
    setShowHidden(false);
    setWorkProjectKind('existing');
    setProjectName('');
    setShowWorkBrowser(false);
    setHasChosenWorkFolder(false);
    setLoadedBrowsePath('');
    requestAnimationFrame(() => focusPathInput(inputRef.current));

    let cancelled = false;
    const resolveHome = async () => {
      const resolved = await resolveFreshFilesystemHome();
      if (cancelled) return;
      setDialogHomeDirectory(resolved || homeDirectory || '');
      requestAnimationFrame(() => focusPathInput(inputRef.current));
    };
    void resolveHome();
    return () => {
      cancelled = true;
    };
  }, [homeDirectory, open]);

  React.useEffect(() => {
    if (!open || !isDeveloperMode) return;
    void loadGitIdentityProfiles();
    void loadGlobalGitIdentity();
    void loadDefaultGitIdentityId();
  }, [isDeveloperMode, loadDefaultGitIdentityId, loadGitIdentityProfiles, loadGlobalGitIdentity, open]);

  React.useEffect(() => {
    if (isDeveloperMode) return;
    setIsCloneMode(false);
    setCloneRemoteUrl('');
    setSelectedGitIdentityId(null);
  }, [isDeveloperMode]);

  const availableGitIdentities = React.useMemo(() => {
    const unique = new Map<string, NonNullable<typeof globalGitIdentity>>();
    if (globalGitIdentity) {
      unique.set(globalGitIdentity.id, globalGitIdentity);
    }
    for (const profile of gitIdentityProfiles) {
      unique.set(profile.id, profile);
    }
    return Array.from(unique.values());
  }, [gitIdentityProfiles, globalGitIdentity]);

  React.useEffect(() => {
    if (!open || !isCloneMode || selectedGitIdentityId !== null) return;
    const defaultId = defaultGitIdentityId?.trim() ?? '';
    if (defaultId && availableGitIdentities.some((identity) => identity.id === defaultId)) {
      setSelectedGitIdentityId(defaultId);
      return;
    }
    const firstSshIdentity = availableGitIdentities.find((identity) => identity.authType === 'ssh' || identity.sshKey);
    if (firstSshIdentity) {
      setSelectedGitIdentityId(firstSshIdentity.id);
    }
  }, [availableGitIdentities, defaultGitIdentityId, isCloneMode, open, selectedGitIdentityId]);

  const selectedGitIdentity = React.useMemo(
    () => availableGitIdentities.find((identity) => identity.id === selectedGitIdentityId) ?? null,
    [availableGitIdentities, selectedGitIdentityId]
  );

  const browseDirectoryDisplayPath = React.useMemo(() => getBrowseDirectoryPath(query), [query]);
  const browseFilterQuery = React.useMemo(
    () => (hasTrailingPathSeparator(query) ? '' : getBrowseLeafPathSegment(query)),
    [query]
  );
  const browseDirectoryAbsolutePath = React.useMemo(
    () => explorerRootDirectory ? displayPathToAbsolutePath(browseDirectoryDisplayPath, explorerRootDirectory) : '',
    [browseDirectoryDisplayPath, explorerRootDirectory]
  );

  React.useEffect(() => {
    if (!open || !browseDirectoryAbsolutePath) {
      setEntries([]);
      setBrowseErrorReason(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsBrowseDirectoryMissing(false);
    setBrowseErrorReason(null);
    opencodeClient.listLocalDirectory(browseDirectoryAbsolutePath)
      .then((result) => {
        if (cancelled) return;
        setIsBrowseDirectoryMissing(false);
        setBrowseErrorReason(null);
        const nextEntries = result
          .filter((entry) => entry.isDirectory)
          .map((entry) => ({
            name: entry.name,
            path: normalizeSeparators(entry.path),
          }))
          .sort((left, right) => left.name.localeCompare(right.name));
        setEntries(nextEntries);
      })
      .catch((error) => {
        if (!cancelled) {
          setEntries([]);
          const reason = isFilesystemError(error) ? error.reason : 'unknown';
          setBrowseErrorReason(reason);
          setIsBrowseDirectoryMissing(reason === 'not-found');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedBrowsePath(browseDirectoryAbsolutePath);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [browseDirectoryAbsolutePath, browseReloadKey, open]);

  const filteredEntries = React.useMemo(() => {
    const lowerFilter = browseFilterQuery.toLowerCase();
    const includeHidden = showHidden || browseFilterQuery.startsWith('.');
    return entries.filter((entry) => (
      entry.name.toLowerCase().startsWith(lowerFilter) && (includeHidden || !entry.name.startsWith('.'))
    ));
  }, [browseFilterQuery, entries, showHidden]);

  const rows = React.useMemo<BrowseRow[]>(() => {
    const nextRows: BrowseRow[] = [];
    if (canNavigateUp(query)) {
      nextRows.push({ type: 'up', value: 'browse:up', name: '..', path: getBrowseParentPath(query) });
    }
    for (const entry of filteredEntries) {
      const normalized = normalizeDirectoryPath(entry.path);
      nextRows.push({
        type: 'directory',
        value: `browse:${entry.path}`,
        name: entry.name,
        path: entry.path,
        added: Boolean(normalized && addedProjectPaths.has(normalized)),
      });
    }
    return nextRows;
  }, [addedProjectPaths, filteredEntries, query]);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [query, rows.length]);

  const selectedFolderPath = React.useMemo(() => {
    if (!explorerRootDirectory) return '';
    return trimTrailingSeparators(displayPathToAbsolutePath(query, explorerRootDirectory));
  }, [explorerRootDirectory, query]);
  const isCreatingWorkProject = !isDeveloperMode && workProjectKind === 'new';
  const parsedProjectName = projectFolderNameSchema.safeParse(projectName);
  const workNameExists = isCreatingWorkProject && entries.some((entry) => entry.name.toLowerCase() === projectName.trim().toLowerCase());
  const targetPath = isCreatingWorkProject
    ? parsedProjectName.success && selectedFolderPath
      ? `${ensureBrowseDirectoryPath(selectedFolderPath)}${parsedProjectName.data}`
      : ''
    : selectedFolderPath;
  const normalizedTargetPath = normalizeDirectoryPath(targetPath);
  const isAlreadyAdded = Boolean(normalizedTargetPath && addedProjectPaths.has(normalizedTargetPath));
  const exactEntry = React.useMemo(() => {
    if (!browseFilterQuery) return null;
    return filteredEntries.find((entry) => entry.name === browseFilterQuery) ?? null;
  }, [browseFilterQuery, filteredEntries]);
  const shouldCreateTarget = isCreatingWorkProject || (isDeveloperMode && Boolean(
    targetPath
    && !isAlreadyAdded
    && (browseErrorReason === null || browseErrorReason === 'not-found')
    && (
      (hasTrailingPathSeparator(query) && isBrowseDirectoryMissing)
      || (!hasTrailingPathSeparator(query) && browseFilterQuery.trim().length > 0 && exactEntry === null)
    )
  ));
  const canAddProject = !isLoading
    && loadedBrowsePath === browseDirectoryAbsolutePath
    && !isConfirming
    && !isOpeningPicker
    && !isAlreadyAdded
    && browseErrorReason !== 'os-permission'
    && browseErrorReason !== 'invalid-response'
    && browseErrorReason !== 'unknown'
    && Boolean(targetPath)
    && (isDeveloperMode || (
      !isBrowseDirectoryMissing
      && (isCreatingWorkProject ? parsedProjectName.success && !workNameExists : hasChosenWorkFolder)
    ));
  const canSubmitClone = canAddProject && cloneRemoteUrl.trim().length > 0;
  const highlightedRow = rows[highlightedIndex] ?? null;
  const hasHighlightedBrowseItem = highlightedRow !== null;
  const submitModifierLabel = formatShortcutForDisplay('mod');
  const submitActionLabel = isAlreadyAdded
    && (isDeveloperMode || hasChosenWorkFolder || isCreatingWorkProject)
    ? t('directoryExplorerDialog.actions.alreadyAdded')
    : isCloneMode
      ? isConfirming
        ? t('directoryExplorerDialog.actions.cloning')
        : t('directoryExplorerDialog.actions.cloneAndAdd')
    : isConfirming
      ? t('directoryExplorerDialog.actions.adding')
    : isCreatingWorkProject
      ? t('directoryExplorerDialog.work.createProject')
    : shouldCreateTarget
      ? t('directoryExplorerDialog.actions.createAndAdd')
      : t('directoryExplorerDialog.actions.addProject');

  React.useLayoutEffect(() => {
    if (!open) return;
    focusPathInput(inputRef.current);
  }, [open]);

  React.useLayoutEffect(() => {
    const row = rows[highlightedIndex];
    if (!row) return;
    rowRefs.current.get(row.value)?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, rows]);

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const openProjectDraft = React.useCallback((projectId: string, projectPath: string) => {
    if (isMobile) setSessionSwitcherOpen(false);
    openNewSessionDraft({ selectedProjectId: projectId, directoryOverride: projectPath });
    handleClose();
  }, [handleClose, isMobile, openNewSessionDraft, setSessionSwitcherOpen]);

  const finalizeSelection = React.useCallback(async (target: string) => {
    if (!target || !(isCloneMode ? canSubmitClone : canAddProject)) return;
    const normalized = normalizeDirectoryPath(target);
    if (normalized && addedProjectPaths.has(normalized)) return;
    let selectedTarget = target;

    setIsConfirming(true);
    try {
      const shouldCreateSelection = !isCloneMode && shouldCreateTarget && normalizeDirectoryPath(target) === normalizeDirectoryPath(targetPath);
      if (isCloneMode) {
        const remoteUrl = cloneRemoteUrl.trim();
        if (!remoteUrl) {
          toast.error(t('directoryExplorerDialog.toast.cloneUrlRequired'));
          return;
        }
        const result = await opencodeClient.cloneRepository({
          remoteUrl,
          destinationPath: target,
          gitIdentityId: selectedGitIdentity?.id ?? null,
        });
        selectedTarget = result.path;
      } else if (shouldCreateSelection) {
        const result = await opencodeClient.createDirectory(target, { asProject: true });
        if (!result.success) throw new Error(t('directoryExplorerDialog.toast.failedToSelectDirectory'));
        selectedTarget = result.path;
      }
      const project = addProject(selectedTarget);
      if (!project) {
        toast.error(t('directoryExplorerDialog.toast.failedToAddProject'), {
          description: t('directoryExplorerDialog.toast.selectValidDirectoryPath'),
        });
        return;
      }
      openProjectDraft(project.id, project.path);
    } catch (error) {
      toast.error(t('directoryExplorerDialog.toast.failedToSelectDirectory'), {
        description: error instanceof Error ? error.message : t('directoryExplorerDialog.toast.unknownError'),
      });
    } finally {
      setIsConfirming(false);
    }
  }, [addProject, addedProjectPaths, canAddProject, canSubmitClone, cloneRemoteUrl, isCloneMode, openProjectDraft, selectedGitIdentity?.id, shouldCreateTarget, targetPath, t]);

  const browseToDisplayPath = React.useCallback((displayPath: string) => {
    setQuery(ensureBrowseDirectoryPath(displayPath));
    setHasChosenWorkFolder(true);
  }, []);

  const browseToEntry = React.useCallback((entry: BrowseEntry) => {
    setQuery(appendBrowsePathSegment(query, entry.name));
    setHasChosenWorkFolder(true);
  }, [query]);

  const executeRow = React.useCallback((row: BrowseRow | null) => {
    if (!row) return;
    if (row.type === 'up') {
      if (row.path) browseToDisplayPath(row.path);
      return;
    }
    browseToEntry(row);
  }, [browseToDisplayPath, browseToEntry]);

  const handleBrowseFolders = React.useCallback(async () => {
    if (!canRequestAccess || isOpeningPicker) return;
    setIsOpeningPicker(true);
    try {
      const result = await requestAccess(selectedFolderPath);
      if (!result.success || !result.path) {
        if (result.error && result.error !== 'Directory selection cancelled') {
          toast.error(t('directoryExplorerDialog.toast.failedToSelectDirectory'), {
            description: result.error,
          });
        }
        return;
      }

      const accessResult = await startAccessing(result.path);
      if (!accessResult.success) {
        toast.error(t('directoryExplorerDialog.toast.failedToOpenDirectory'), {
          description: accessResult.error || t('directoryExplorerDialog.toast.desktopCouldNotGrantAccess'),
        });
        return;
      }

      browseToDisplayPath(normalizeSeparators(result.path));
      setShowWorkBrowser(false);
    } catch (error) {
      toast.error(t('directoryExplorerDialog.toast.failedToSelectDirectory'), {
        description: error instanceof Error ? error.message : t('directoryExplorerDialog.toast.unknownError'),
      });
    } finally {
      setIsOpeningPicker(false);
    }
  }, [browseToDisplayPath, canRequestAccess, isOpeningPicker, requestAccess, startAccessing, t, selectedFolderPath]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(rows.length - 1, index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (isPrimaryModifierPressed(event)) {
        if (isCloneMode ? canSubmitClone : canAddProject) void finalizeSelection(targetPath);
        return;
      }
      if (hasHighlightedBrowseItem) {
        executeRow(highlightedRow);
      }
      return;
    }
    if (event.key === 'Backspace' && query === '') {
      event.preventDefault();
      handleClose();
    }
  }, [canAddProject, canSubmitClone, executeRow, finalizeSelection, handleClose, hasHighlightedBrowseItem, highlightedRow, isCloneMode, query, rows.length, targetPath]);

  const showHiddenToggle = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={showHidden}
      onClick={() => setShowHidden((value) => !value)}
      className="flex-shrink-0 gap-1.5 px-2 text-muted-foreground"
    >
      {showHidden ? <Icon name="checkbox" className="h-4 w-4 text-foreground" /> : <Icon name="checkbox-blank" className="h-4 w-4" />}
      <span className="max-[360px]:sr-only">{t('directoryExplorerDialog.toggle.showHidden')}</span>
    </Button>
  );

  const workProjectForm = (
    <div className="space-y-5 px-3 py-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="chip" aria-pressed={workProjectKind === 'existing'} onClick={() => setWorkProjectKind('existing')} disabled={isConfirming}>
          {t('directoryExplorerDialog.work.existingFolder')}
        </Button>
        <Button variant="chip" aria-pressed={workProjectKind === 'new'} onClick={() => setWorkProjectKind('new')} disabled={isConfirming}>
          {t('directoryExplorerDialog.work.newProject')}
        </Button>
      </div>
      {isCreatingWorkProject ? (
        <div className="space-y-2">
          <label htmlFor={projectNameId} className="typography-ui-label font-medium">{t('directoryExplorerDialog.work.projectName')}</label>
          <Input
            id={projectNameId}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder={t('directoryExplorerDialog.work.namePlaceholder')}
            disabled={isConfirming}
            maxLength={255}
            aria-invalid={Boolean(projectName && !parsedProjectName.success) || workNameExists}
            aria-describedby={`${projectNameId}-help`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !showWorkBrowser) {
                event.preventDefault();
                void finalizeSelection(targetPath);
              }
            }}
          />
          <p id={`${projectNameId}-help`} className={cn('typography-meta', (projectName && !parsedProjectName.success) || workNameExists ? 'text-status-error' : 'text-muted-foreground')}>
            {workNameExists
              ? t('directoryExplorerDialog.work.nameExists')
              : projectName && !parsedProjectName.success
                ? t('directoryExplorerDialog.work.invalidName')
                : t('directoryExplorerDialog.work.nameHint')}
          </p>
        </div>
      ) : null}
      <div className="space-y-2">
        <div className="typography-ui-label font-medium">
          {isCreatingWorkProject ? t('directoryExplorerDialog.work.saveLocation') : t('directoryExplorerDialog.pathInput.label')}
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          {isCreatingWorkProject || hasChosenWorkFolder || showWorkBrowser ? (
            <div className="mb-3 flex items-start gap-2 text-muted-foreground">
              <Icon name="folder-6" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-all typography-meta">{selectedFolderPath}</span>
            </div>
          ) : (
            <p className="mb-3 typography-meta text-muted-foreground">{t('directoryExplorerDialog.work.chooseFolderHint')}</p>
          )}
          <Button variant="outline" size="sm" disabled={isConfirming || isOpeningPicker} onClick={() => {
            if (canRequestAccess) void handleBrowseFolders();
            else setShowWorkBrowser((value) => !value);
          }}>
            <Icon name="folder-6" className="size-4" />
            {isOpeningPicker ? t('directoryExplorerDialog.actions.openingPicker') : t('directoryExplorerDialog.actions.chooseFolder')}
          </Button>
        </div>
        {browseErrorReason && !showWorkBrowser ? (
          <div className="flex flex-wrap items-center gap-2" role="alert">
            <p className="typography-meta text-status-error">{t('directoryExplorerDialog.browse.loadFailed')}</p>
            <Button variant="ghost" size="sm" onClick={() => setBrowseReloadKey((key) => key + 1)}>{t('directoryExplorerDialog.browse.retry')}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );

  const inputSection = (
    <div className={cn(useMobileSheet ? 'px-1 py-0' : 'px-2.5 py-3')}>
      <div className="mb-2 typography-meta text-muted-foreground">{t('directoryExplorerDialog.pathInput.label')}</div>
      {isDeveloperMode && isCloneMode ? (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Input
            value={cloneRemoteUrl}
            onChange={(event) => setCloneRemoteUrl(event.target.value)}
            placeholder={t('directoryExplorerDialog.clone.remoteUrlPlaceholder')}
            className="min-w-0 flex-1 border-border/60 bg-[var(--surface-elevated)] font-mono typography-ui-label shadow-none"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <IdentityDropdown
            activeProfile={selectedGitIdentity}
            identities={availableGitIdentities}
            onSelect={(profile) => setSelectedGitIdentityId(profile.id)}
            isApplying={isConfirming}
            iconOnly
          />
        </div>
      ) : null}
      <div className={cn('relative', useMobileSheet && 'border-b border-border/40')}>
        <Icon name="folder-6" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(normalizeSeparators(event.target.value))}
          onKeyDown={handleKeyDown}
          placeholder={t('directoryExplorerDialog.pathInput.placeholder')}
          className={cn(
            'border-border/60 bg-[var(--surface-elevated)] pl-9 font-mono typography-ui-label shadow-none',
            useMobileSheet && 'rounded-none ring-0 hover:bg-transparent focus:ring-0',
          )}
          aria-label={t('directoryExplorerDialog.pathInput.label')}
          disabled={isConfirming}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />

      </div>
      <p className="mt-2 truncate typography-micro text-muted-foreground" title={targetPath}>{targetPath}</p>
    </div>
  );

  const resultsSection = (
    <div className={cn('relative min-h-0 flex-1 overflow-hidden', !useMobileSheet && 'border-t border-border/40')}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <span className="typography-meta font-medium text-muted-foreground">{t('directoryExplorerDialog.browse.directories')}</span>
        {showHiddenToggle}
      </div>
      <div className="max-h-[min(28rem,58vh)] overflow-y-auto px-1 py-2">
        {isLoading ? (
          <div className="py-10 text-center typography-ui-label text-muted-foreground">
            {t('directoryExplorerDialog.browse.loading')}
          </div>
        ) : browseErrorReason && browseErrorReason !== 'not-found' ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <div className="typography-ui-label text-status-error">
              {browseErrorReason === 'os-permission'
                ? t('directoryExplorerDialog.browse.permissionDenied')
                : t('directoryExplorerDialog.browse.loadFailed')}
            </div>
            <div className="flex items-center gap-2">
              {browseErrorReason === 'os-permission' && canRequestAccess ? (
                <Button size="xs" onClick={() => void handleBrowseFolders()} disabled={isOpeningPicker}>
                  {t('directoryExplorerDialog.browse.grantAccess')}
                </Button>
              ) : null}
              <Button variant="outline" size="xs" onClick={() => setBrowseReloadKey((key) => key + 1)}>
                {t('directoryExplorerDialog.browse.retry')}
              </Button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center typography-ui-label text-muted-foreground">
            {t('directoryExplorerDialog.browse.empty')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {rows.map((row, index) => {
              const isActive = index === highlightedIndex;
              return (
                <div
                  key={row.value}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'flex w-full items-center rounded-md transition-colors',
                    isActive && 'bg-interactive-selection text-interactive-selection-foreground'
                  )}
                >
                  <button
                    ref={(node) => {
                      if (node) {
                        rowRefs.current.set(row.value, node);
                      } else {
                        rowRefs.current.delete(row.value);
                      }
                    }}
                    type="button"
                    disabled={isConfirming}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => executeRow(row)}
                    className={cn(
                      'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]',
                      !isActive && 'hover:bg-interactive-hover/50'
                    )}
                  >
                    {row.type === 'up' ? (
                      <Icon name="arrow-left-s" className="h-4 w-4 flex-shrink-0 text-muted-foreground/80" />
                    ) : (
                      <Icon name="folder-6" className="h-4 w-4 flex-shrink-0 text-muted-foreground/80" />
                    )}
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate typography-ui-label text-foreground">{row.type === 'up' ? t('directoryExplorerDialog.browse.parentDirectory') : row.name}</span>
                    </span>
                    {row.type === 'directory' && row.added ? (
                      <span className="rounded-full border border-border/60 px-2 py-0.5 typography-meta text-muted-foreground">
                        {t('directoryExplorerDialog.browse.addedBadge')}
                      </span>
                    ) : null}
                    {row.type === 'directory' ? <Icon name="arrow-right-s" className="size-4 text-muted-foreground" /> : null}
                  </button>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {isDeveloperMode ? inputSection : workProjectForm}
      {isDeveloperMode || showWorkBrowser ? resultsSection : null}
    </div>
  );

  const footerHints = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 typography-micro text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Icon name="arrow-up-s" className="h-3.5 w-3.5" />
        <Icon name="arrow-down-s" className="-ml-1 h-3.5 w-3.5" />
        {t('directoryExplorerDialog.footer.navigate')}
      </span>
      <span className="inline-flex items-center gap-1">
        <Icon name="corner-down-left" className="h-3.5 w-3.5" />
        {t('directoryExplorerDialog.footer.select')}
      </span>
      <span className="inline-flex items-center gap-1">
        <span>{submitModifierLabel}</span>
        <Icon name="corner-down-left" className="h-3.5 w-3.5" />
        {t('directoryExplorerDialog.footer.add')}
      </span>
    </div>
  );

  const renderFooter = () => (
    <>
      {isDeveloperMode && !useMobileSheet && (!isMobile || hasHardwareKeyboard) ? footerHints : null}
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        {isDeveloperMode && canRequestAccess ? (
          <Button variant="ghost" size="sm" onClick={handleBrowseFolders} disabled={isConfirming || isOpeningPicker || isCloneMode}>
            {isOpeningPicker ? t('directoryExplorerDialog.actions.openingPicker') : t('directoryExplorerDialog.actions.chooseFolder')}
          </Button>
        ) : null}
        {isDeveloperMode ? (
          <Button variant="ghost" size="sm" onClick={() => setIsCloneMode((value) => !value)} disabled={isConfirming || isOpeningPicker}>
            {isCloneMode ? t('directoryExplorerDialog.actions.addLocalProject') : t('directoryExplorerDialog.actions.cloneRepository')}
          </Button>
        ) : null}
        {!isDeveloperMode && showWorkBrowser ? (
          <Button onClick={() => { setHasChosenWorkFolder(true); setShowWorkBrowser(false); }} disabled={isLoading || loadedBrowsePath !== browseDirectoryAbsolutePath || Boolean(browseErrorReason) || !selectedFolderPath}>
            {t('directoryExplorerDialog.work.selectFolder')}
          </Button>
        ) : <Button onClick={() => void finalizeSelection(targetPath)} disabled={isCloneMode ? !canSubmitClone : !canAddProject}>
            {submitActionLabel}
        </Button>}
      </div>
    </>
  );

  if (useMobileSheet) {
    return (
      <MobileOverlayPanel
        open={open}
        onClose={handleClose}
        title={t('directoryExplorerDialog.title')}
        renderHeader={(closeButton) => (
          <div className="flex items-center gap-1 border-b border-border/40 px-3 py-2">
            <h2 className="min-w-0 flex-1 truncate typography-ui-label font-semibold text-foreground">
              {t('directoryExplorerDialog.title')}
            </h2>
            {closeButton}
          </div>
        )}
        // Height only — the width stays on MobileOverlayPanel's shared max-w-lg
        // so this sheet matches every other mobile overlay on wide screens.
        className={isDeveloperMode || showWorkBrowser ? 'h-[88dvh] max-h-[720px]' : 'max-h-[88dvh]'}
        contentMaxHeightClassName="flex-1"
        footer={renderFooter()}
      >
        <div className="flex h-full min-h-0 flex-col">
          {content}
        </div>
      </MobileOverlayPanel>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex w-full max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[80vh]"
        initialFocus={false}
      >
        <DialogHeader className="pl-5 pr-12 pb-2 pt-5 text-left">
              <DialogTitle>{t('directoryExplorerDialog.title')}</DialogTitle>
              <DialogDescription>{isDeveloperMode ? t('directoryExplorerDialog.description') : t('directoryExplorerDialog.work.description')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-0">{content}</div>
        <DialogFooter className="flex w-full shrink-0 flex-col gap-3 border-t border-border/40 px-5 py-3 sm:flex-col sm:items-stretch">
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
