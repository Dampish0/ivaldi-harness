import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { isMobileDeviceViaCSS } from '@/lib/device';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import {
  selectSkillsForDirectory,
  selectSkillsLoadErrorForDirectory,
  useSkillsStore,
  type DiscoveredSkill,
} from '@/stores/useSkillsStore';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { SidebarGroup } from '@/components/sections/shared/SidebarGroup';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';
import { SETTINGS_PANEL_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { useUIStore } from '@/stores/useUIStore';

interface SkillsSidebarProps {
  onItemSelect?: () => void;
}

const BUILT_IN_SKILL_LOCATION = '<built-in>';

const isBuiltInSkill = (skill: DiscoveredSkill | null | undefined): boolean => skill?.path === BUILT_IN_SKILL_LOCATION;
const isRenamableSkill = (skill: DiscoveredSkill | null | undefined): boolean => (
  !!skill && !isBuiltInSkill(skill) && skill.renamable === true
);

export const SkillsSidebar: React.FC<SkillsSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n();
  const isDeveloperMode = useProductModeStore((state) => state.mode === 'developer');
  const setSettingsPage = useUIStore((state) => state.setSettingsPage);
  const [renameDialogSkill, setRenameDialogSkill] = React.useState<DiscoveredSkill | null>(null);
  const [renameNewName, setRenameNewName] = React.useState('');
  const [deleteDialogSkill, setDeleteDialogSkill] = React.useState<DiscoveredSkill | null>(null);
  const [isDeletePending, setIsDeletePending] = React.useState(false);
  const [openMenuSkill, setOpenMenuSkill] = React.useState<string | null>(null);

  const {
    selectedSkillName,
    setSelectedSkill,
    setSkillDraft,
    deleteSkill,
    renameSkill,
    getSkillDetail,
  } = useSkillsStore(useShallow((s) => ({
    selectedSkillName: s.selectedSkillName,
    setSelectedSkill: s.setSelectedSkill,
    setSkillDraft: s.setSkillDraft,
    deleteSkill: s.deleteSkill,
    renameSkill: s.renameSkill,
    getSkillDetail: s.getSkillDetail,
  })));

  // Settings browses whichever project its own selector points at; the app
  // stays where it is.
  const settingsDirectory = useSettingsDirectory();
  const skills = useSkillsStore((state) => selectSkillsForDirectory(state, settingsDirectory));
  const loadError = useSkillsStore((state) => selectSkillsLoadErrorForDirectory(state, settingsDirectory));
  const loadSkills = useSkillsStore((state) => state.loadSkills);

  React.useEffect(() => {
    void loadSkills(settingsDirectory);
  }, [loadSkills, settingsDirectory]);

  const bgClass = 'bg-background';

  const handleCreateNew = () => {
    // Generate unique name
    const baseName = 'new-skill';
    let newName = baseName;
    let counter = 1;
    while (skills.some((s) => s.name === newName)) {
      newName = `${baseName}-${counter}`;
      counter++;
    }

    // Set draft and open the page for editing
    setSkillDraft({ name: newName, scope: 'user', source: 'opencode', description: '' });
    setSelectedSkill(newName);
    onItemSelect?.();

  };

  const handleDeleteSkill = async (skill: DiscoveredSkill) => {
    if (isBuiltInSkill(skill)) return;
    setDeleteDialogSkill(skill);
  };

  const handleConfirmDeleteSkill = async () => {
    if (!deleteDialogSkill) {
      return;
    }
    if (isBuiltInSkill(deleteDialogSkill)) {
      setDeleteDialogSkill(null);
      return;
    }

    setIsDeletePending(true);
    const success = await deleteSkill(deleteDialogSkill.name, settingsDirectory);
    if (success) {
      toast.success(t('settings.skills.sidebar.toast.skillDeleted', { name: deleteDialogSkill.name }));
      setDeleteDialogSkill(null);
    } else {
      toast.error(t('settings.skills.sidebar.toast.deleteSkillFailed'));
    }
    setIsDeletePending(false);
  };

  const handleDuplicateSkill = async (skill: DiscoveredSkill) => {
    if (isBuiltInSkill(skill)) return;

    const baseName = skill.name;
    let copyNumber = 1;
    let newName = `${baseName}-copy`;

    while (skills.some((s) => s.name === newName)) {
      copyNumber++;
      newName = `${baseName}-copy-${copyNumber}`;
    }

    // Get full skill detail to copy
    let detail;
    try {
      detail = await getSkillDetail(skill.name, settingsDirectory);
    } catch {
      toast.error(t('settings.skills.sidebar.toast.duplicateLoadFailed'));
      return;
    }
    if (!detail) {
      toast.error(t('settings.skills.sidebar.toast.duplicateLoadFailed'));
      return;
    }

    // Set draft with prefilled values from source skill
      setSkillDraft({
        name: newName,
        scope: skill.scope || 'user',
        source: skill.source || 'opencode',
        description: detail.sources.md.fields.includes('description') ? '' : '', // Will be populated from page
        instructions: '',
      });
    setSelectedSkill(newName);

  };

  const handleOpenRenameDialog = (skill: DiscoveredSkill) => {
    if (!isRenamableSkill(skill)) return;
    setRenameNewName(skill.name);
    setRenameDialogSkill(skill);
  };

  const handleRenameSkill = async () => {
    if (!renameDialogSkill) return;
    if (!isRenamableSkill(renameDialogSkill)) {
      setRenameDialogSkill(null);
      return;
    }

    const sanitizedName = renameNewName.trim().replace(/\s+/g, '-').toLowerCase();

    if (!sanitizedName) {
      toast.error(t('settings.skills.page.toast.skillNameRequired'));
      return;
    }

    if (sanitizedName === renameDialogSkill.name) {
      setRenameDialogSkill(null);
      return;
    }

    if (skills.some((s) => s.name === sanitizedName)) {
      toast.error(t('settings.skills.page.toast.skillExists'));
      return;
    }

    // Rename in place on disk so SKILL.md body and supporting files are preserved.
    const success = await renameSkill(renameDialogSkill.name, sanitizedName, settingsDirectory);
    if (success) {
      toast.success(t('settings.skills.sidebar.toast.skillRenamed', { name: sanitizedName }));
      setSelectedSkill(sanitizedName);
    } else {
      toast.error(t('settings.skills.sidebar.toast.renameFailed'));
    }

    setRenameDialogSkill(null);
  };

  // Separate project and user skills
  const projectSkills = skills.filter((s) => s.scope === 'project');
  const userSkills = skills.filter((s) => s.scope === 'user');

  // Helper: group a list of skills by their domain folder
  function groupSkillsByFolder(list: DiscoveredSkill[]) {
    const groups: Record<string, DiscoveredSkill[]> = {};
    const ungrouped: DiscoveredSkill[] = [];
    for (const skill of list) {
      if (skill.group) {
        if (!groups[skill.group]) groups[skill.group] = [];
        groups[skill.group].push(skill);
      } else {
        ungrouped.push(skill);
      }
    }
    const sortedGroups = Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        skills: [...groups[name]].sort((a, b) => a.name.localeCompare(b.name)),
      }));
    ungrouped.sort((a, b) => a.name.localeCompare(b.name));
    return { sortedGroups, ungrouped };
  }

  const groupedProjectSkills = useMemo(() => groupSkillsByFolder(projectSkills), [projectSkills]);
  const groupedUserSkills = useMemo(() => groupSkillsByFolder(userSkills), [userSkills]);

  return (
    <div className={cn('flex h-full flex-col', bgClass)}>
      <div className="border-b px-3 pt-4 pb-3">
        <h2 className={`${SETTINGS_PANEL_TITLE_CLASS} mb-3`}>{t('settings.skills.sidebar.title')}</h2>
        <SettingsProjectSelector className="mb-3" />
        <div className="flex items-center justify-between gap-2">
          <span className="typography-meta text-muted-foreground">{t('settings.skills.sidebar.total', { count: skills.length })}</span>
          {isDeveloperMode ? (
            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 -my-1 text-muted-foreground"
                onClick={() => setSettingsPage('skills.catalog')}
                aria-label={t('settings.page.skillsCatalog.title')}
                title={t('settings.page.skillsCatalog.title')}
              >
                <Icon name="book" className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                data-settings-item="skills.create"
                variant="ghost"
                className="h-7 w-7 -my-1 text-muted-foreground"
                onClick={handleCreateNew}
                aria-label={t('settings.common.actions.create')}
                title={t('settings.common.actions.create')}
              >
                <Icon name="add" className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setSettingsPage('skills.catalog')}
              >
                <Icon name="book" className="h-3.5 w-3.5" />
                <span>{t('settings.page.skillsCatalog.title')}</span>
              </Button>
              <Button
                size="xs"
                data-settings-item="skills.create"
                variant="outline"
                onClick={handleCreateNew}
              >
                <Icon name="add" className="h-3.5 w-3.5" />
                <span>{t('settings.common.actions.create')}</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2 overflow-x-hidden">
        {loadError ? (
          <div
            role="status"
            className="flex items-center gap-2 px-2 py-2 typography-meta text-[var(--status-error)]"
          >
            <Icon name="error-warning" className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{t('settings.skills.sidebar.state.loadFailed')}</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void loadSkills(settingsDirectory)}
            >
              {t('settings.skills.page.actions.retry')}
            </Button>
          </div>
        ) : null}
        {skills.length === 0 && !loadError ? (
          <div className="px-2 py-4">
            <p className="typography-ui-label font-medium text-foreground">{t('settings.skills.sidebar.empty.title')}</p>
            <p className="typography-meta mt-1 text-muted-foreground">{t('settings.skills.sidebar.empty.description')}</p>
          </div>
        ) : (
          <>
            {projectSkills.length > 0 && (
              <>
                <div className="px-2 pb-1.5 pt-2 typography-meta font-medium text-muted-foreground/80">
                  {t('settings.skills.sidebar.section.project')}
                </div>
                {groupedProjectSkills.sortedGroups.map(({ name: groupName, skills: groupSkills }) => (
                  <SidebarGroup
                    key={groupName}
                    label={groupName}
                    count={groupSkills.length}
                    storageKey="project-skills"
                  >
                    {groupSkills.map((skill) => (
                      <SkillListItem
                        key={skill.name}
                        skill={skill}
                        isSelected={selectedSkillName === skill.name}
                        onSelect={() => {
                          setSelectedSkill(skill.name);
                          onItemSelect?.();

                        }}
                        onRename={() => handleOpenRenameDialog(skill)}
                        onDelete={() => handleDeleteSkill(skill)}
                        onDuplicate={() => handleDuplicateSkill(skill)}
                        isMenuOpen={openMenuSkill === skill.name}
                        onMenuOpenChange={(open) => setOpenMenuSkill(open ? skill.name : null)}
                      />
                    ))}
                  </SidebarGroup>
                ))}
                {groupedProjectSkills.ungrouped.map((skill) => (
                  <SkillListItem
                    key={skill.name}
                    skill={skill}
                    isSelected={selectedSkillName === skill.name}
                    onSelect={() => {
                      setSelectedSkill(skill.name);
                      onItemSelect?.();

                    }}
                    onRename={() => handleOpenRenameDialog(skill)}
                    onDelete={() => handleDeleteSkill(skill)}
                    onDuplicate={() => handleDuplicateSkill(skill)}
                    isMenuOpen={openMenuSkill === skill.name}
                    onMenuOpenChange={(open) => setOpenMenuSkill(open ? skill.name : null)}
                  />
                ))}
              </>
            )}

            {userSkills.length > 0 && (
              <>
                <div className="px-2 pb-1.5 pt-3 typography-meta font-medium text-muted-foreground/80">
                  {t('settings.skills.sidebar.section.user')}
                </div>
                {groupedUserSkills.sortedGroups.map(({ name: groupName, skills: groupSkills }) => (
                  <SidebarGroup
                    key={groupName}
                    label={groupName}
                    count={groupSkills.length}
                    storageKey="user-skills"
                  >
                    {groupSkills.map((skill) => (
                      <SkillListItem
                        key={skill.name}
                        skill={skill}
                        isSelected={selectedSkillName === skill.name}
                        onSelect={() => {
                          setSelectedSkill(skill.name);
                          onItemSelect?.();

                        }}
                        onRename={() => handleOpenRenameDialog(skill)}
                        onDelete={() => handleDeleteSkill(skill)}
                        onDuplicate={() => handleDuplicateSkill(skill)}
                        isMenuOpen={openMenuSkill === skill.name}
                        onMenuOpenChange={(open) => setOpenMenuSkill(open ? skill.name : null)}
                      />
                    ))}
                  </SidebarGroup>
                ))}
                {groupedUserSkills.ungrouped.map((skill) => (
                  <SkillListItem
                    key={skill.name}
                    skill={skill}
                    isSelected={selectedSkillName === skill.name}
                    onSelect={() => {
                      setSelectedSkill(skill.name);
                      onItemSelect?.();

                    }}
                    onRename={() => handleOpenRenameDialog(skill)}
                    onDelete={() => handleDeleteSkill(skill)}
                    onDuplicate={() => handleDuplicateSkill(skill)}
                    isMenuOpen={openMenuSkill === skill.name}
                    onMenuOpenChange={(open) => setOpenMenuSkill(open ? skill.name : null)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollableOverlay>

      <Dialog
        open={deleteDialogSkill !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletePending) {
            setDeleteDialogSkill(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.skills.sidebar.deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.skills.sidebar.deleteDialog.description', { name: deleteDialogSkill?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              className="text-foreground hover:bg-interactive-hover hover:text-foreground"
              variant="ghost"
              onClick={() => setDeleteDialogSkill(null)}
              disabled={isDeletePending}
            >
              {t('settings.common.actions.cancel')}
            </Button>
            <Button size="sm" onClick={handleConfirmDeleteSkill} disabled={isDeletePending}>
              {t('settings.common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogSkill !== null} onOpenChange={(open) => !open && setRenameDialogSkill(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.skills.sidebar.renameDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.skills.sidebar.renameDialog.description', { name: renameDialogSkill?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameNewName}
            onChange={(e) => setRenameNewName(e.target.value)}
            placeholder={t('settings.skills.sidebar.renameDialog.placeholder')}
            className="text-foreground placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRenameSkill();
              }
            }}
          />
          <DialogFooter>
            <Button
              size="sm"
              className="text-foreground hover:bg-interactive-hover hover:text-foreground"
              variant="ghost"
              onClick={() => setRenameDialogSkill(null)}
            >
              {t('settings.common.actions.cancel')}
            </Button>
            <Button size="sm" onClick={handleRenameSkill}>
              {t('settings.common.actions.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface SkillListItemProps {
  skill: DiscoveredSkill;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

const SkillListItem: React.FC<SkillListItemProps> = ({
  skill,
  isSelected,
  onSelect,
  onDelete,
  onRename,
  onDuplicate,
  isMenuOpen,
  onMenuOpenChange,
}) => {
  const { t } = useI18n();
  const isMobile = isMobileDeviceViaCSS();
  const isBuiltIn = isBuiltInSkill(skill);
  const canRename = isRenamableSkill(skill);
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const renderMenuItems = (Item: React.ElementType) => (
    <>
      {canRename ? (
        <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRename(); }}>
          <Icon name="edit" className="h-4 w-4 mr-px" />
          {t('settings.common.actions.rename')}
        </Item>
      ) : null}
      <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDuplicate(); }}>
        <Icon name="file-copy" className="h-4 w-4 mr-px" />
        {t('settings.common.actions.duplicate')}
      </Item>
      <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive">
        <Icon name="delete-bin" className="h-4 w-4 mr-px" />
        {t('settings.common.actions.delete')}
      </Item>
    </>
  );
  return (
    <ContextMenu open={!isBuiltIn && isContextMenuOpen} onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger render={<div className={cn('group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200 select-none', isSelected ? 'bg-interactive-selection' : 'hover:bg-interactive-hover')} onContextMenu={!isMobile && !isBuiltIn ? (e) => { e.preventDefault(); setIsContextMenuOpen(true); } : undefined} />}>
      <div className="flex min-w-0 flex-1 items-center">
        <button
          onClick={onSelect}
          className="flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
          tabIndex={0}
        >
          <div className="flex items-center gap-1.5">
            <span className="typography-ui-label font-normal truncate text-foreground">
              {skill.name}
            </span>
          </div>
        </button>

        {!isBuiltIn ? <DropdownMenu open={isMenuOpen} onOpenChange={(open) => { if (open) setIsContextMenuOpen(false); onMenuOpenChange(open); }}>
          <DropdownMenuTrigger asChild>
            <Button size="sm"
              variant="ghost"
              className="h-6 w-6 px-0 flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
            >
              <Icon name="more-2" className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-fit min-w-20">
            {renderMenuItems(DropdownMenuItem)}
          </DropdownMenuContent>
        </DropdownMenu> : null}
      </div>
      </ContextMenuTrigger>
      {!isBuiltIn ? (
        <ContextMenuContent className="w-fit min-w-20">
          {renderMenuItems(ContextMenuItem)}
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
};
