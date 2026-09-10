import type { ContextPanelMode } from '@/stores/useUIStore';
import type { SettingsPageSlug } from '@/lib/settings/metadata';

export type ProductMode = 'work' | 'developer';

export const DEFAULT_PRODUCT_MODE: ProductMode = 'developer';

const DEVELOPER_ONLY_CONTEXT_MODES = new Set<ContextPanelMode>([
  'git',
  'pr',
  'diff',
  'walkthrough',
  'terminal',
]);

const WORK_MODE_SETTINGS_PAGES = new Set<SettingsPageSlug>([
  'general',
  'appearance',
  'chat',
  'notifications',
  'sessions',
  'projects',
  'remote-instances',
  'voice',
  'integrations',
  'mcp',
  'plugins',
  'skills.installed',
  'usage',
  'about',
  'advanced',
]);

const WORK_MODE_REACHABLE_SETTINGS_PAGES = new Set<SettingsPageSlug>([
  ...WORK_MODE_SETTINGS_PAGES,
  'providers',
  'agents',
  'behavior',
  'commands',
  'lifecycle-hooks',
  'mcp',
  'plugins',
  'skills.installed',
  'skills.catalog',
  'shortcuts',
  'remote-instances',
]);

const WORK_MODE_ADVANCED_DETAIL_SETTINGS_PAGES = new Set<SettingsPageSlug>([
  'providers',
  'agents',
  'behavior',
  'commands',
  'lifecycle-hooks',
  'shortcuts',
]);

const DEVELOPER_ONLY_COMPOSER_COMMANDS = new Set([
  'init',
  'explore',
  'undo',
  'redo',
  'timeline',
  'review',
  'workspace-review',
  'handoff-review',
  'plan-feature',
  'craft-goal',
  'debug',
  'customize-opencode',
]);

const DEVELOPER_ONLY_COMPOSER_SKILLS = new Set([
  'customize-opencode',
]);

const DEVELOPER_ONLY_SHORTCUT_ACTIONS = new Set([
  'new_chat_worktree',
  'open_right_sidebar_git',
  'toggle_terminal',
  'toggle_terminal_expanded',
]);

const WORK_MODE_HIDDEN_SETTINGS_KEYWORDS = {
  projects: new Set(['worktree', 'worktrees']),
  appearance: new Set(['terminal']),
} satisfies Partial<Record<SettingsPageSlug, ReadonlySet<string>>>;

const getWorkModeHiddenSettingsKeywords = (slug: SettingsPageSlug): ReadonlySet<string> | undefined => {
  if (slug === 'projects') return WORK_MODE_HIDDEN_SETTINGS_KEYWORDS.projects;
  if (slug === 'appearance') return WORK_MODE_HIDDEN_SETTINGS_KEYWORDS.appearance;
  return undefined;
};

export const isDeveloperOnlyContextMode = (mode: ContextPanelMode): boolean => (
  DEVELOPER_ONLY_CONTEXT_MODES.has(mode)
);

export const isSettingsPageVisibleInProductMode = (
  mode: ProductMode,
  slug: SettingsPageSlug,
): boolean => mode === 'developer'
  ? slug !== 'advanced' && slug !== 'skills.catalog'
  : WORK_MODE_SETTINGS_PAGES.has(slug);

export const isSettingsPageReachableInProductMode = (
  mode: ProductMode,
  slug: SettingsPageSlug,
): boolean => mode === 'developer'
  ? slug !== 'advanced'
  : WORK_MODE_REACHABLE_SETTINGS_PAGES.has(slug);

export const isWorkAdvancedSettingsDetailPage = (slug: SettingsPageSlug): boolean => (
  WORK_MODE_ADVANCED_DETAIL_SETTINGS_PAGES.has(slug)
);

export const isSettingsPageAvailableInProductMode = (
  mode: ProductMode,
  slug: SettingsPageSlug,
  baseAvailable: boolean,
  context: { isVSCode: boolean },
): boolean => {
  if (mode === 'work' && slug === 'about') {
    return !context.isVSCode;
  }
  return baseAvailable;
};

export const isComposerCommandVisibleInProductMode = (
  mode: ProductMode,
  commandName: string,
): boolean => mode === 'developer' || !DEVELOPER_ONLY_COMPOSER_COMMANDS.has(commandName.trim().toLowerCase());

export const isComposerSkillVisibleInProductMode = (
  mode: ProductMode,
  skillName: string,
): boolean => mode === 'developer' || !DEVELOPER_ONLY_COMPOSER_SKILLS.has(skillName.trim().toLowerCase());

export const isShortcutVisibleInProductMode = (
  mode: ProductMode,
  shortcutId: string,
): boolean => mode === 'developer' || !DEVELOPER_ONLY_SHORTCUT_ACTIONS.has(shortcutId.trim());

export const getSettingsPageKeywordsInProductMode = (
  mode: ProductMode,
  slug: SettingsPageSlug,
  keywords: readonly string[],
): readonly string[] => {
  if (mode === 'developer') return keywords;
  const hidden = getWorkModeHiddenSettingsKeywords(slug);
  if (!hidden) return keywords;
  return keywords.filter((keyword) => !hidden.has(keyword.trim().toLowerCase()));
};
