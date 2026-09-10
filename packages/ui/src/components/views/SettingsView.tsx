import React from 'react';
import { cn } from '@/lib/utils';
import {
  formatShortcutForDisplay,
  getEffectiveShortcutCombo,
} from '@/lib/shortcuts';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useProductModeStore } from '@/stores/useProductModeStore';
import {
  isSettingsPageAvailableInProductMode,
  isSettingsPageReachableInProductMode,
  isSettingsPageVisibleInProductMode,
  isWorkAdvancedSettingsDetailPage,
} from '@/lib/productMode';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { useSnippetsStore } from '@/stores/useSnippetsStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { useSkillsCatalogStore } from '@/stores/useSkillsCatalogStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { usePluginsStore } from '@/stores/usePluginsStore';
import type { OpenChamberSection } from '@/components/sections/openchamber/types';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SETTINGS_SECTION_TITLE_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useDeviceInfo } from '@/lib/device';
import { isDesktopLocalOriginActive, isDesktopShell, isVSCodeRuntime, isWebRuntime } from '@/lib/desktop';
import { isWindowsArm64 as isWindowsArm64Platform } from '@/lib/platform';
import { useI18n } from '@/lib/i18n';
import { Icon } from "@/components/icon/Icon";
import { McpIcon } from '@/components/icons/McpIcon';
import { OpenCodeReloadFooterAction } from '@/components/views/OpenCodeReloadFooterAction';
import {
  selectPendingOpenCodeRestartCount,
  usePendingOpenCodeRestartStore,
} from '@/stores/usePendingOpenCodeRestartStore';
import {
  SETTINGS_PAGE_METADATA,
  getSettingsNavIcon,
  getSettingsPageMeta,
  resolveSettingsSlug,
  type SettingsPageSlug,
  type SettingsRuntimeContext,
  type SettingsPageMeta,
} from '@/lib/settings/metadata';
import { buildSettingsSearchResults, type SettingsSearchResult } from '@/lib/settings/search';
import { lazyWithChunkRecovery } from '@/lib/chunkLoadRecovery';

const AgentsSidebar = lazyWithChunkRecovery(() => import('@/components/sections/agents/AgentsSidebar').then((module) => ({ default: module.AgentsSidebar })));
const AgentsPage = lazyWithChunkRecovery(() => import('@/components/sections/agents/AgentsPage').then((module) => ({ default: module.AgentsPage })));
const BehaviorPage = lazyWithChunkRecovery(() => import('@/components/sections/behavior/BehaviorPage').then((module) => ({ default: module.BehaviorPage })));
const CommandsSidebar = lazyWithChunkRecovery(() => import('@/components/sections/commands/CommandsSidebar').then((module) => ({ default: module.CommandsSidebar })));
const CommandsPage = lazyWithChunkRecovery(() => import('@/components/sections/commands/CommandsPage').then((module) => ({ default: module.CommandsPage })));
const LifecycleHooksPage = lazyWithChunkRecovery(() => import('@/components/sections/lifecycle-hooks/LifecycleHooksPage').then((module) => ({ default: module.LifecycleHooksPage })));
const McpSidebar = lazyWithChunkRecovery(() => import('@/components/sections/mcp/McpSidebar').then((module) => ({ default: module.McpSidebar })));
const McpPage = lazyWithChunkRecovery(() => import('@/components/sections/mcp/McpPage').then((module) => ({ default: module.McpPage })));
const PluginsSidebar = lazyWithChunkRecovery(() => import('@/components/sections/plugins').then((module) => ({ default: module.PluginsSidebar })));
const PluginsPage = lazyWithChunkRecovery(() => import('@/components/sections/plugins').then((module) => ({ default: module.PluginsPage })));
const SkillsSidebar = lazyWithChunkRecovery(() => import('@/components/sections/skills/SkillsSidebar').then((module) => ({ default: module.SkillsSidebar })));
const SkillsPage = lazyWithChunkRecovery(() => import('@/components/sections/skills/SkillsPage').then((module) => ({ default: module.SkillsPage })));
const ProjectsSidebar = lazyWithChunkRecovery(() => import('@/components/sections/projects/ProjectsSidebar').then((module) => ({ default: module.ProjectsSidebar })));
const ProjectsPage = lazyWithChunkRecovery(() => import('@/components/sections/projects/ProjectsPage').then((module) => ({ default: module.ProjectsPage })));
const RemoteInstancesPage = lazyWithChunkRecovery(() => import('@/components/sections/remote-instances/RemoteInstancesPage').then((module) => ({ default: module.RemoteInstancesPage })));
const ProvidersSidebar = lazyWithChunkRecovery(() => import('@/components/sections/providers/ProvidersSidebar').then((module) => ({ default: module.ProvidersSidebar })));
const ProvidersPage = lazyWithChunkRecovery(() => import('@/components/sections/providers/ProvidersPage').then((module) => ({ default: module.ProvidersPage })));
const UsageSidebar = lazyWithChunkRecovery(() => import('@/components/sections/usage/UsageSidebar').then((module) => ({ default: module.UsageSidebar })));
const UsagePage = lazyWithChunkRecovery(() => import('@/components/sections/usage/UsagePage').then((module) => ({ default: module.UsagePage })));
const MagicPromptsSidebar = lazyWithChunkRecovery(() => import('@/components/sections/magic-prompts/MagicPromptsSidebar').then((module) => ({ default: module.MagicPromptsSidebar })));
const MagicPromptsPage = lazyWithChunkRecovery(() => import('@/components/sections/magic-prompts/MagicPromptsPage').then((module) => ({ default: module.MagicPromptsPage })));
const SnippetsSidebar = lazyWithChunkRecovery(() => import('@/components/sections/snippets/SnippetsSidebar').then((module) => ({ default: module.SnippetsSidebar })));
const SnippetsPage = lazyWithChunkRecovery(() => import('@/components/sections/snippets/SnippetsPage').then((module) => ({ default: module.SnippetsPage })));
const GitPage = lazyWithChunkRecovery(() => import('@/components/sections/git-identities/GitPage').then((module) => ({ default: module.GitPage })));
const IntegrationsPage = lazyWithChunkRecovery(() => import('@/components/sections/integrations/IntegrationsPage').then((module) => ({ default: module.IntegrationsPage })));
const WorkAdvancedSettingsPage = lazyWithChunkRecovery(() => import('@/components/sections/openchamber/WorkAdvancedSettingsPage').then((module) => ({ default: module.WorkAdvancedSettingsPage })));
const OpenChamberPage = lazyWithChunkRecovery(() => import('@/components/sections/openchamber/OpenChamberPage').then((module) => ({ default: module.OpenChamberPage })));
const AboutSettings = lazyWithChunkRecovery(() => import('@/components/sections/openchamber/AboutSettings').then((module) => ({ default: module.AboutSettings })));

const SettingsRouteBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <React.Suspense fallback={<div className="h-full min-h-0 bg-background" aria-hidden="true" />}>
    {children}
  </React.Suspense>
);

// UI Kit: fixed settings navigation width
const SETTINGS_NAV_WIDTH = 256;
const SETTINGS_SPLIT_SIDEBAR_WIDTH = 280;
const TABLET_SETTINGS_NAV_WIDTH = 220;
const TABLET_SETTINGS_SPLIT_SIDEBAR_WIDTH = 220;
const TABLET_SETTINGS_SPLIT_MIN_WIDTH = 800;
const SETTINGS_DETAIL_HISTORY_KEY = '__openchamberSettingsDetail';

type MobileStage = 'nav' | 'page-sidebar' | 'page-content';
type SettingsDetailHistoryEntry = {
  page: SettingsPageSlug;
  stage: 'page-content';
};

interface SettingsViewProps {
  onClose?: () => void;
  /** Force mobile layout regardless of device detection */
  forceMobile?: boolean;
  /** Keep mobile runtime availability, but use a compact split Settings body on roomy tablets. */
  wideMobileLayout?: boolean;
  /** Rendered inside a window/dialog (skip traffic light padding) */
  isWindowed?: boolean;
  /** Restrict top-level settings navigation to a specific product surface. */
  visiblePageSlugs?: SettingsPageSlug[];
  initialMobileStage?: MobileStage;
}

const pageOrder: SettingsPageSlug[] = [
  // Ivaldi
  'general',
  'appearance',
  'chat',
  'sessions',
  'voice',
  'notifications',
  'shortcuts',
  // Workspace
  'projects',
  'git',
  'integrations',
  'remote-instances',
  'tunnel',
  // AI & Agents
  'providers',
  'agents',
  'behavior',
  'commands',
  'lifecycle-hooks',
  // Tools
  'mcp',
  'plugins',
  'skills.installed',
  'skills.catalog',
  // Prompts
  'magic-prompts',
  'snippets',
  // System
  'usage',
  'about',
  'advanced',
];

const workPageOrder: SettingsPageSlug[] = [
  'general',
  'appearance',
  'chat',
  'sessions',
  'notifications',
  'voice',
  'usage',
  'about',
  'projects',
  'remote-instances',
  'integrations',
  'mcp',
  'plugins',
  'skills.installed',
  'advanced',
];

const NAV_GROUP_ORDER = ['general', 'projects', 'opencode', 'tools', 'content', 'system'] as const;
const WORK_NAV_GROUP_ORDER = ['general', 'projects', 'tools', 'opencode'] as const;

const ADD_PROVIDER_SETTINGS_ID = '__add_provider__';

function buildRuntimeContext(isDesktop: boolean, isMobile: boolean): SettingsRuntimeContext {
  const isVSCode = isVSCodeRuntime();
  const isWeb = !isDesktop && isWebRuntime();
  return { isVSCode, isWeb, isDesktop, isMobile };
}

function isPageAvailable(page: SettingsPageMeta, ctx: SettingsRuntimeContext): boolean {
  if (!page.isAvailable) {
    return true;
  }
  return page.isAvailable(ctx);
}

function isPageAvailableForProductMode(
  page: SettingsPageMeta,
  ctx: SettingsRuntimeContext,
  productMode: 'work' | 'developer',
): boolean {
  return isSettingsPageAvailableInProductMode(
    productMode,
    page.slug,
    isPageAvailable(page, ctx),
    ctx,
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nextUniqueName(baseName: string, existingNames: Iterable<string>): string {
  const existing = new Set(existingNames);
  let name = baseName;
  let counter = 1;
  while (existing.has(name)) {
    name = `${baseName}-${counter}`;
    counter += 1;
  }
  return name;
}

function getSettingsDetailHistoryEntry(state: unknown): SettingsDetailHistoryEntry | null {
  if (!isObjectRecord(state)) {
    return null;
  }

  const detail = state[SETTINGS_DETAIL_HISTORY_KEY];
  if (!isObjectRecord(detail)) {
    return null;
  }

  const page = detail.page;
  const stage = detail.stage;
  if (typeof page !== 'string' || stage !== 'page-content') {
    return null;
  }

  const resolvedPage = resolveSettingsSlug(page);
  return { page: resolvedPage, stage };
}

function getCurrentHistoryState(): Record<string, unknown> {
  if (typeof window === 'undefined' || !isObjectRecord(window.history.state)) {
    return {};
  }
  return window.history.state;
}


export const SettingsView: React.FC<SettingsViewProps> = ({ onClose, forceMobile, wideMobileLayout = false, isWindowed, visiblePageSlugs, initialMobileStage = 'nav' }) => {
  const { t } = useI18n();
  const productMode = useProductModeStore((state) => state.mode);
  const deviceInfo = useDeviceInfo();
  const isMobile = forceMobile ?? deviceInfo.isMobile;
  const useWideMobileLayout = isMobile
    && wideMobileLayout
    && deviceInfo.screenWidth >= TABLET_SETTINGS_SPLIT_MIN_WIDTH;
  const useStackedMobileLayout = isMobile && !useWideMobileLayout;
  const pendingRestartCount = usePendingOpenCodeRestartStore(selectPendingOpenCodeRestartCount);

  const settingsPageRaw = useUIStore((state) => state.settingsPage);
  const isSettingsDialogOpen = useUIStore((state) => state.isSettingsDialogOpen);
  const setSettingsPage = useUIStore((state) => state.setSettingsPage);
  const openSettingsShortcutOverride = useUIStore((state) => state.shortcutOverrides.open_settings);
  const settingsSlug = resolveSettingsSlug(settingsPageRaw);

  const [mobileStage, setMobileStage] = React.useState<MobileStage>(initialMobileStage);
  // Seed with the mount-time slug when opening at the nav stage: the slug
  // persists across opens, and the deep-link auto-jump below must react only
  // to slug CHANGES after mount — not re-enter the previously visited page
  // every time settings reopen.
  const autoNavSlugRef = React.useRef<string | null>(initialMobileStage === 'nav' ? settingsSlug : null);

  // No starter page on desktop: 'home' (fresh state) resolves to General.
  // settingsPage persists in the UI store, so subsequent opens restore the
  // last visited page. Mobile keeps 'home' — its entry stage is the nav list.
  React.useEffect(() => {
    if (!useStackedMobileLayout && settingsSlug === 'home') {
      setSettingsPage('general');
    }
  }, [setSettingsPage, settingsSlug, useStackedMobileLayout]);

  const [settingsSearchQuery, setSettingsSearchQuery] = React.useState('');
  const [pendingSearchItemId, setPendingSearchItemId] = React.useState<string | null>(null);
  const [activeSearchResultIndex, setActiveSearchResultIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchResultRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const activeSearchResultIndexRef = React.useRef(0);
  const keyboardSearchNavigationRef = React.useRef(false);

  const isDesktopApp = React.useMemo(() => {
    return isDesktopShell();
  }, []);
  const isDesktopLocalOrigin = React.useMemo(() => {
    return isDesktopShell() && isDesktopLocalOriginActive();
  }, []);
  const isMac = React.useMemo(() => {
    return isDesktopShell() && typeof window !== 'undefined'
      && (window as unknown as { __OPENCHAMBER_PLATFORM__?: string }).__OPENCHAMBER_PLATFORM__ === 'darwin';
  }, []);
  const isWindows = React.useMemo(() => {
    return isDesktopShell() && typeof window !== 'undefined'
      && (window as unknown as { __OPENCHAMBER_PLATFORM__?: string }).__OPENCHAMBER_PLATFORM__ === 'win32';
  }, []);
  const isLinux = React.useMemo(() => {
    return isDesktopShell() && typeof window !== 'undefined'
      && (window as unknown as { __OPENCHAMBER_PLATFORM__?: string }).__OPENCHAMBER_PLATFORM__ === 'linux';
  }, []);
  const isWindowsArm64 = React.useMemo(() => isWindowsArm64Platform(), []);

  // keep platform check available for future window chrome tweaks

  const runtimeCtx = React.useMemo(() => buildRuntimeContext(isDesktopApp, isMobile), [isDesktopApp, isMobile]);

  const visiblePages = React.useMemo(() => {
    const allowedPages = visiblePageSlugs ? new Set<SettingsPageSlug>(visiblePageSlugs) : null;
    return SETTINGS_PAGE_METADATA
      .filter((page) => page.slug !== 'home')
      .filter((page) => !allowedPages || allowedPages.has(page.slug))
      .filter((page) => isSettingsPageVisibleInProductMode(productMode, page.slug))
      .filter((page) => isPageAvailableForProductMode(page, runtimeCtx, productMode))
      .filter((page) => !(runtimeCtx.isVSCode && page.slug === 'projects'))
      .filter((page) => !(isMobile && page.slug === 'shortcuts'));
  }, [runtimeCtx, isMobile, productMode, visiblePageSlugs]);

  const visibleSettingsPageSlugs = React.useMemo(
    () => visiblePages.map((page) => page.slug),
    [visiblePages],
  );

  React.useEffect(() => {
    if (settingsSlug === 'home') {
      return;
    }
    const currentMeta = getSettingsPageMeta(settingsSlug);
    const explicitlyAllowed = !visiblePageSlugs || visiblePageSlugs.includes(settingsSlug);
    const reachable = isSettingsPageReachableInProductMode(productMode, settingsSlug);
    const available = currentMeta
      ? isPageAvailableForProductMode(currentMeta, runtimeCtx, productMode)
      : false;
    if (explicitlyAllowed && reachable && available) return;
    setSettingsPage(visibleSettingsPageSlugs[0] ?? 'general');
  }, [productMode, runtimeCtx, setSettingsPage, settingsSlug, visiblePageSlugs, visibleSettingsPageSlugs]);

  const sortedFilteredPages = React.useMemo(() => {
    const order = productMode === 'work' ? workPageOrder : pageOrder;
    const rank = new Map<SettingsPageSlug, number>(order.map((s, i) => [s, i]));
    return visiblePages
      .slice()
      .sort((a, b) => (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999));
  }, [productMode, visiblePages]);

  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const settingsDirectory = useSettingsDirectory();

  // Load stores when the settings project changes or a page becomes active.
  React.useEffect(() => {
    if (!isSettingsDialogOpen && !runtimeCtx.isVSCode && !isWindowed) {
      return;
    }

    if (settingsSlug === 'agents') {
      void useAgentsStore.getState().loadAgents(settingsDirectory);
      return;
    }
    if (settingsSlug === 'commands') {
      void useCommandsStore.getState().loadCommands(settingsDirectory);
      return;
    }
    if (settingsSlug === 'mcp') {
      void useMcpConfigStore.getState().loadMcpConfigs({ directory: settingsDirectory });
      return;
    }
    if (settingsSlug === 'plugins') {
      void usePluginsStore.getState().loadPlugins();
      return;
    }
    if (settingsSlug === 'skills.installed' || settingsSlug === 'skills.catalog') {
      void useSkillsStore.getState().loadSkills(settingsDirectory);
      void useSkillsCatalogStore.getState().loadCatalog();
    }
    if (settingsSlug === 'snippets') {
      void useSnippetsStore.getState().loadSnippets();
    }
    // `activeProjectId` still matters: the settings directory follows the active
    // project until the user picks another one in the Settings selector.
  }, [activeProjectId, isSettingsDialogOpen, isWindowed, runtimeCtx.isVSCode, settingsDirectory, settingsSlug]);

  const openPage = React.useCallback((slug: SettingsPageSlug) => {
    setSettingsPage(slug);
    autoNavSlugRef.current = slug;
    if (!useStackedMobileLayout) {
      return;
    }
    const def = getSettingsPageMeta(slug);
    if (!def || def.slug === 'home') {
      setMobileStage('nav');
      return;
    }
    setMobileStage(def.kind === 'split' ? 'page-sidebar' : 'page-content');
  }, [setSettingsPage, useStackedMobileLayout]);

  const openThirdPartyProviderSetup = React.useCallback(async (providerId: string): Promise<boolean> => {
    const configStore = useConfigStore.getState();
    await configStore.loadProviders({ source: 'settings:third-party-provider-setup' });
    const providerAvailable = useConfigStore.getState().providers.some(
      (provider) => provider.id === providerId,
    );
    if (!providerAvailable) {
      return false;
    }

    configStore.setSelectedProvider(providerId);
    openPage('providers');
    if (useStackedMobileLayout) {
      setMobileStage('page-content');
    }
    return true;
  }, [openPage, useStackedMobileLayout]);

  const activePageMeta = React.useMemo(() => {
    return getSettingsPageMeta(settingsSlug);
  }, [settingsSlug]);

  // Nav is always open (collapsed state removed)

  const openChamberSectionBySlug: Partial<Record<SettingsPageSlug, OpenChamberSection>> = React.useMemo(() => ({
    general: 'general',
    appearance: 'visual',
    chat: 'chat',
    shortcuts: 'shortcuts',
    sessions: 'sessions',
    notifications: 'notifications',
    voice: 'voice',
    tunnel: 'tunnel',
  }), []);

  const getPageTitle = React.useCallback((slug: SettingsPageSlug): string => {
    switch (slug) {
      case 'general':
        return t('settings.page.general.title');
      case 'projects':
        return t('settings.page.projects.title');
      case 'remote-instances':
        return t('settings.page.remoteInstances.title');
      case 'providers':
        return t('settings.page.providers.title');
      case 'usage':
        return t('settings.page.usage.title');
      case 'agents':
        return t('settings.page.agents.title');
      case 'behavior':
        return t('settings.page.behavior.title');
      case 'commands':
        return t('settings.page.commands.title');
      case 'lifecycle-hooks':
        return productMode === 'work'
          ? t('settings.page.lifecycleHooks.workTitle')
          : t('settings.page.lifecycleHooks.title');
      case 'mcp':
        return t('settings.page.mcp.title');
      case 'plugins':
        return t('settings.page.plugins.title');
      case 'skills.installed':
        return t('settings.page.skills.title');
      case 'skills.catalog':
        return t('settings.page.skillsCatalog.title');
      case 'git':
        return t('settings.page.git.title');
      case 'integrations':
        return t('settings.page.integrations.title');
      case 'appearance':
        return t('settings.page.appearance.title');
      case 'chat':
        return t('settings.page.chat.title');
      case 'shortcuts':
        return t('settings.page.shortcuts.title');
      case 'sessions':
        return productMode === 'work'
          ? t('settings.page.work.ai.title')
          : t('settings.page.sessions.title');
      case 'magic-prompts':
        return t('settings.page.magicPrompts.title');
      case 'snippets':
        return t('settings.page.snippets.title');
      case 'notifications':
        return t('settings.page.notifications.title');
      case 'voice':
        return t('settings.page.voice.title');
      case 'tunnel':
        return t('settings.page.tunnel.title');
      case 'about':
        return t('settings.page.about.title');
      case 'advanced':
        return t('settings.view.nav.group.advanced');
      case 'home':
      default:
        return t('settings.view.home.title');
    }
  }, [productMode, t]);

  const settingsSearchResults = React.useMemo(() => {
    return buildSettingsSearchResults({
      query: settingsSearchQuery,
      runtimeCtx: { ...runtimeCtx, productMode, isDesktopLocalOrigin, isMac, isWindows, isLinux, isWindowsArm64 },
      visiblePageSlugs: visibleSettingsPageSlugs,
      t,
      getPageTitle,
    });
  }, [getPageTitle, isWindowsArm64, isDesktopLocalOrigin, isMac, isWindows, isLinux, productMode, runtimeCtx, settingsSearchQuery, t, visibleSettingsPageSlugs]);

  const prepareSettingsSearchTarget = React.useCallback((result: SettingsSearchResult): string => {
    if (result.id.startsWith('agents.')) {
      const store = useAgentsStore.getState();
      const name = nextUniqueName('new-agent', store.agents.map((agent) => agent.name));
      store.setAgentDraft({ name, scope: 'user' });
      store.setSelectedAgent(name);
      return result.id === 'agents.create' ? 'agents.name' : result.id;
    }

    if (result.id.startsWith('commands.')) {
      const store = useCommandsStore.getState();
      const name = nextUniqueName('new-command', store.commands.map((command) => command.name));
      store.setCommandDraft({ name, scope: 'user' });
      store.setSelectedCommand(name);
      return result.id === 'commands.create' ? 'commands.name' : result.id;
    }

    if (result.id.startsWith('mcp.')) {
      const store = useMcpConfigStore.getState();
      const name = nextUniqueName('new-mcp-server', store.mcpServers.map((server) => server.name));
      store.setMcpDraft({
        name,
        scope: 'user',
        type: 'local',
        command: [],
        url: '',
        environment: [],
        headers: [],
        oauthEnabled: true,
        oauthClientId: '',
        oauthClientSecret: '',
        oauthScope: '',
        oauthRedirectUri: '',
        timeout: '',
        enabled: true,
      });
      store.setSelectedMcp(name);
      return result.id === 'mcp.create' ? 'mcp.server' : result.id;
    }

    if (result.id.startsWith('snippets.')) {
      const store = useSnippetsStore.getState();
      const name = nextUniqueName('new-snippet', store.snippets.map((snippet) => snippet.name));
      store.setSnippetDraft({ name, scope: 'global' });
      store.setSelectedSnippet(name);
      return result.id === 'snippets.create' ? 'snippets.content' : result.id;
    }

    if (result.id.startsWith('skills.')) {
      const store = useSkillsStore.getState();
      const name = nextUniqueName('new-skill', store.skills.map((skill) => skill.name));
      store.setSkillDraft({ name, scope: 'user', source: 'opencode', description: '', instructions: '' });
      store.setSelectedSkill(name);
      return result.id === 'skills.create' ? 'skills.basic-information' : result.id;
    }

    if (result.id === 'providers.connect') {
      useConfigStore.getState().setSelectedProvider(ADD_PROVIDER_SETTINGS_ID);
    }

    if (result.id === 'plugins.create') {
      return 'plugins.spec';
    }

    return result.id;
  }, []);

  const groupedSettingsSearchResults = React.useMemo(() => {
    const groups: Array<{ page: SettingsPageSlug; pageTitle: string; results: SettingsSearchResult[] }> = [];
    const groupByPage = new Map<SettingsPageSlug, { page: SettingsPageSlug; pageTitle: string; results: SettingsSearchResult[] }>();
    for (const result of settingsSearchResults) {
      let group = groupByPage.get(result.page);
      if (!group) {
        group = { page: result.page, pageTitle: result.pageTitle, results: [] };
        groupByPage.set(result.page, group);
        groups.push(group);
      }
      group.results.push(result);
    }
    return groups;
  }, [settingsSearchResults]);

  React.useEffect(() => {
    setActiveSearchResultIndex(0);
    activeSearchResultIndexRef.current = 0;
    keyboardSearchNavigationRef.current = false;
  }, [settingsSearchQuery]);

  React.useEffect(() => {
    activeSearchResultIndexRef.current = activeSearchResultIndex;
  }, [activeSearchResultIndex]);

  React.useEffect(() => {
    searchResultRefs.current[activeSearchResultIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeSearchResultIndex]);

  React.useEffect(() => {
    if (activeSearchResultIndex >= settingsSearchResults.length) {
      setActiveSearchResultIndex(Math.max(0, settingsSearchResults.length - 1));
    }
    searchResultRefs.current.length = settingsSearchResults.length;
  }, [activeSearchResultIndex, settingsSearchResults.length]);

  const openSearchResult = React.useCallback((result: SettingsSearchResult) => {
    const targetId = prepareSettingsSearchTarget(result);
    setPendingSearchItemId(targetId);
    openPage(result.page);
    if (useStackedMobileLayout) {
      setMobileStage('page-content');
    }
    if (result.id === 'plugins.create' && typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('openchamber:settings-open-plugin-add'));
      }, 50);
    }
  }, [openPage, prepareSettingsSearchTarget, useStackedMobileLayout]);

  const handleSettingsSearchKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!settingsSearchQuery.trim()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setSettingsSearchQuery('');
      return;
    }

    if (settingsSearchResults.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      keyboardSearchNavigationRef.current = true;
      setActiveSearchResultIndex((current) => (current + 1) % settingsSearchResults.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      keyboardSearchNavigationRef.current = true;
      setActiveSearchResultIndex((current) => (current - 1 + settingsSearchResults.length) % settingsSearchResults.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const safeIndex = ((activeSearchResultIndexRef.current % settingsSearchResults.length) + settingsSearchResults.length) % settingsSearchResults.length;
      const result = settingsSearchResults[safeIndex] ?? settingsSearchResults[0];
      if (result) {
        openSearchResult(result);
      }
    }
  }, [openSearchResult, settingsSearchQuery, settingsSearchResults]);

  React.useEffect(() => {
    const targetId = pendingSearchItemId;
    if (!targetId) {
      return;
    }

    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      const escapedId = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(targetId)
        : targetId.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      const target = containerRef.current?.querySelector<HTMLElement>(`[data-settings-item="${escapedId}"]`);
      if (!target) {
        return;
      }
      setPendingSearchItemId(null);
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.setAttribute('data-settings-search-highlight', 'true');
      window.setTimeout(() => {
        target.removeAttribute('data-settings-search-highlight');
      }, 1600);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [pendingSearchItemId, settingsSlug]);

  const renderUnavailable = React.useCallback(() => {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className={SETTINGS_SECTION_TITLE_CLASS}>{t('settings.view.unavailable.title')}</div>
          <p className="typography-ui text-muted-foreground mt-1">{t('settings.view.unavailable.description')}</p>
        </div>
      </div>
    );
  }, [t]);

  const renderPageSidebar = React.useCallback((slug: SettingsPageSlug, opts: { onItemSelect?: () => void }) => {
    switch (slug) {
      case 'projects':
        return <ProjectsSidebar onItemSelect={opts.onItemSelect} />;
      case 'agents':
        return <AgentsSidebar onItemSelect={opts.onItemSelect} />;
      case 'commands':
        return <CommandsSidebar onItemSelect={opts.onItemSelect} />;
      case 'mcp':
        return <McpSidebar onItemSelect={opts.onItemSelect} />;
      case 'plugins':
        return <PluginsSidebar onItemSelect={opts.onItemSelect} />;
      case 'skills.installed':
        return <SkillsSidebar onItemSelect={opts.onItemSelect} />;
      case 'providers':
        return <ProvidersSidebar onItemSelect={opts.onItemSelect} />;
      case 'usage':
        return <UsageSidebar onItemSelect={opts.onItemSelect} />;
      case 'magic-prompts':
        return <MagicPromptsSidebar onItemSelect={opts.onItemSelect} />;
      case 'snippets':
        return <SnippetsSidebar onItemSelect={opts.onItemSelect} />;
      default:
        return null;
    }
  }, []);

  const renderPageContent = React.useCallback((slug: SettingsPageSlug) => {
    const meta = getSettingsPageMeta(slug);
    if (meta && !isPageAvailableForProductMode(meta, runtimeCtx, productMode)) {
      return renderUnavailable();
    }

    switch (slug) {
      case 'projects':
        return <ProjectsPage />;
      case 'remote-instances':
        return <RemoteInstancesPage />;
      case 'agents':
        return <AgentsPage />;
      case 'behavior':
        return <BehaviorPage />;
      case 'commands':
        return <CommandsPage />;
      case 'lifecycle-hooks':
        return <LifecycleHooksPage />;
      case 'mcp':
        return <McpPage />;
      case 'plugins':
        return <PluginsPage />;
      case 'skills.installed':
        return <SkillsPage view="installed" />;
      case 'skills.catalog':
        return <SkillsPage view="catalog" />;
      case 'providers':
        return <ProvidersPage />;
      case 'usage':
        return <UsagePage />;
      case 'about':
        return (
          <SettingsPageLayout title={t('settings.page.about.title')} showSaveStatus={false}>
            <AboutSettings />
          </SettingsPageLayout>
        );
      case 'magic-prompts':
        return <MagicPromptsPage />;
      case 'snippets':
        return <SnippetsPage />;
      case 'git':
        return <GitPage />;
      case 'integrations':
        return (
          <IntegrationsPage
            onOpenProviderSetup={openThirdPartyProviderSetup}
            onOpenPluginManager={() => openPage('plugins')}
          />
        );
      case 'advanced':
        return productMode === 'work'
          ? <WorkAdvancedSettingsPage onOpenPage={openPage} />
          : renderUnavailable();
      case 'general':
      case 'appearance':
      case 'chat':
      case 'shortcuts':
      case 'sessions':
      case 'notifications':
      case 'voice':
      case 'tunnel': {
        const section = openChamberSectionBySlug[slug] ?? 'visual';
        return <OpenChamberPage section={section} />;
      }
      case 'home':
      default:
        return null;
    }
  }, [openChamberSectionBySlug, openPage, openThirdPartyProviderSetup, productMode, renderUnavailable, runtimeCtx, t]);

  // Mobile: if opened via deep-link / palette to a non-home page, jump into it once.
  React.useEffect(() => {
    if (!useStackedMobileLayout) {
      return;
    }
    if (mobileStage !== 'nav') {
      return;
    }
    if (settingsSlug === 'home') {
      return;
    }
    if (autoNavSlugRef.current === settingsSlug) {
      return;
    }
    const def = getSettingsPageMeta(settingsSlug);
    if (!def || def.slug === 'home') {
      return;
    }
    autoNavSlugRef.current = settingsSlug;
    setMobileStage(def.kind === 'split' ? 'page-sidebar' : 'page-content');
  }, [mobileStage, settingsSlug, useStackedMobileLayout]);

  const showBackButton = useStackedMobileLayout && mobileStage !== 'nav';
  const backButtonTargetsPageSidebar = useStackedMobileLayout && mobileStage === 'page-content' && settingsSlug === 'skills.installed';
  const showOpenPageSidebarButton = useStackedMobileLayout && mobileStage === 'page-content'
    && activePageMeta?.kind === 'split'
    && !backButtonTargetsPageSidebar;
  const mobileBackButtonLabel = backButtonTargetsPageSidebar
    ? t('settings.view.actions.back')
    : showBackButton
      ? t('settings.view.actions.backToSettings')
      : t('settings.view.actions.closeSettings');
  const openSettingsCombo = getEffectiveShortcutCombo(
    'open_settings',
    openSettingsShortcutOverride === undefined ? undefined : { open_settings: openSettingsShortcutOverride },
  );
  const closeSettingsTitle = openSettingsCombo
    ? t('settings.view.actions.closeSettingsWithShortcut', {
        shortcut: formatShortcutForDisplay(openSettingsCombo),
      })
    : t('settings.view.actions.closeSettings');

  const pushMobileSplitDetailHistory = React.useCallback((slug: SettingsPageSlug) => {
    if (typeof window === 'undefined' || runtimeCtx.isVSCode) {
      return;
    }

    const currentDetail = getSettingsDetailHistoryEntry(window.history.state);
    if (currentDetail?.page === slug && currentDetail.stage === 'page-content') {
      return;
    }

    window.history.pushState(
      {
        ...getCurrentHistoryState(),
        [SETTINGS_DETAIL_HISTORY_KEY]: { page: slug, stage: 'page-content' },
      },
      '',
      window.location.href,
    );
  }, [runtimeCtx.isVSCode]);

  const handleMobilePageSidebarItemSelect = React.useCallback(() => {
    setMobileStage('page-content');
    if (settingsSlug === 'skills.installed') {
      pushMobileSplitDetailHistory(settingsSlug);
    }
  }, [pushMobileSplitDetailHistory, settingsSlug]);

  const handleBack = React.useCallback(() => {
    if (backButtonTargetsPageSidebar) {
      const currentDetail = typeof window !== 'undefined'
        ? getSettingsDetailHistoryEntry(window.history.state)
        : null;
      if (currentDetail?.page === settingsSlug && !runtimeCtx.isVSCode) {
        window.history.back();
        return;
      }
      setMobileStage('page-sidebar');
      return;
    }

    setMobileStage('nav');
  }, [backButtonTargetsPageSidebar, runtimeCtx.isVSCode, settingsSlug]);

  React.useEffect(() => {
    if (!useStackedMobileLayout || runtimeCtx.isVSCode) {
      return;
    }

    const handlePopState = (event: PopStateEvent) => {
      if (settingsSlug !== 'skills.installed') {
        return;
      }

      const detail = getSettingsDetailHistoryEntry(event.state);
      if (detail?.page === 'skills.installed') {
        setMobileStage('page-content');
        return;
      }

      setMobileStage((stage) => stage === 'page-content' ? 'page-sidebar' : stage);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [runtimeCtx.isVSCode, settingsSlug, useStackedMobileLayout]);

  const handleOpenPageSidebar = React.useCallback(() => {
    setMobileStage('page-sidebar');
  }, []);

  const renderSettingsNav = () => {
    const hasSearchQuery = settingsSearchQuery.trim().length > 0;

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="px-4 pt-3">
          <div className="flex h-10 items-center gap-1.5 rounded-md border border-border/60 bg-[var(--surface-elevated)] px-2 text-muted-foreground focus-within:ring-2 focus-within:ring-[var(--interactive-focus-ring)] sm:h-8">
            <Icon name="search" className="h-4 w-4 shrink-0" />
            <input
              value={settingsSearchQuery}
              onChange={(event) => setSettingsSearchQuery(event.target.value)}
              onKeyDown={handleSettingsSearchKeyDown}
              placeholder={t('settings.view.search.placeholder')}
              aria-label={t('settings.view.search.aria')}
              className="typography-ui min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            {hasSearchQuery && (
              <button
                type="button"
                onClick={() => setSettingsSearchQuery('')}
                aria-label={t('settings.view.search.clear')}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-interactive-hover hover:text-foreground sm:h-5 sm:w-5"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable nav items */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col gap-0.5 px-4 pt-4 pb-2">
            {hasSearchQuery ? (
              settingsSearchResults.length > 0 ? (() => {
                let resultIndex = 0;
                return groupedSettingsSearchResults.map((group) => (
                  <div key={group.page} className="space-y-0.5">
                    <div className="px-2 pb-0.5 pt-2 typography-micro font-medium text-muted-foreground/70">
                      {group.pageTitle}
                    </div>
                    {group.results.map((result) => {
                      const currentIndex = resultIndex;
                      resultIndex += 1;
                      const active = currentIndex === activeSearchResultIndex;
                      const hasDescription = Boolean(result.description);
                      return (
                        <button
                          key={result.id}
                          type="button"
                          ref={(element) => {
                            searchResultRefs.current[currentIndex] = element;
                          }}
                          onMouseMove={() => {
                            keyboardSearchNavigationRef.current = false;
                            setActiveSearchResultIndex(currentIndex);
                          }}
                          onClick={() => openSearchResult(result)}
                          className={cn(
                            'flex w-full flex-col rounded-md px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]',
                            hasDescription ? 'min-h-11 py-1.5' : 'py-2',
                            active ? 'bg-interactive-selection' : 'hover:bg-interactive-hover'
                          )}
                        >
                          <span className="typography-ui-label text-foreground truncate">{result.title}</span>
                          {hasDescription && (
                            <span className="typography-micro text-muted-foreground/70 line-clamp-2">{result.description}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ));
              })() : (
                <div className="px-2 py-6 text-center typography-ui text-muted-foreground">
                  {t('settings.view.search.noResults')}
                </div>
              )
            ) : (() => {
              const pagesByGroup = new Map<string, typeof sortedFilteredPages>();
              for (const page of sortedFilteredPages) {
                const group = productMode === 'work'
                  ? page.slug === 'projects' || page.slug === 'integrations' || page.slug === 'remote-instances'
                    ? 'projects'
                    : page.slug === 'mcp' || page.slug === 'plugins' || page.slug === 'skills.installed'
                      ? 'tools'
                    : page.slug === 'advanced'
                      ? 'opencode'
                      : 'general'
                  : page.group;
                const existing = pagesByGroup.get(group);
                if (existing) {
                  existing.push(page);
                } else {
                  pagesByGroup.set(group, [page]);
                }
              }

              const navGroupOrder = productMode === 'work' ? WORK_NAV_GROUP_ORDER : NAV_GROUP_ORDER;
              const visibleGroups = navGroupOrder
                .map((group) => ({ group, pages: pagesByGroup.get(group) ?? [] }))
                .filter((entry) => entry.pages.length > 0);

              return visibleGroups.map(({ group, pages }, groupIndex) => (
                <div key={group} className="space-y-0.5">
                  <div
                    className={cn(
                      'px-3 pb-1 typography-micro font-medium text-muted-foreground sm:px-2 sm:pb-0.5',
                      groupIndex === 0 ? 'pt-1' : 'pt-4 sm:pt-3',
                    )}
                  >
                    {productMode === 'work' && group === 'opencode'
                      ? t('settings.view.nav.group.advanced')
                      : group === 'tools'
                        ? t('settings.view.nav.group.tools')
                        : t(`settings.view.nav.group.${group}`)}
                  </div>
                  {pages.map((page) => {
                    // On the mobile nav STAGE nothing is "current" — the user is
                    // choosing, and settingsSlug only remembers the last visited
                    // page. Keeping it highlighted read as a stuck selection.
                    const selectedSlug = settingsSlug === 'skills.catalog'
                      ? 'skills.installed'
                      : productMode === 'work' && isWorkAdvancedSettingsDetailPage(settingsSlug)
                        ? 'advanced'
                        : settingsSlug;
                    const selected = selectedSlug === page.slug && !(useStackedMobileLayout && mobileStage === 'nav');
                    const iconName = getSettingsNavIcon(page.slug);
                    if (!iconName && page.slug !== 'mcp') return null;

                    return (
                      <Tooltip key={page.slug}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => openPage(page.slug)}
                            aria-current={selected ? 'page' : undefined}
                            className={cn(
                              'flex h-11 w-full items-center gap-2.5 rounded-md px-3 overflow-hidden sm:h-8 sm:gap-2 sm:px-2',
                              selected
                                ? 'bg-interactive-selection text-foreground'
                                : 'text-foreground hover:bg-interactive-hover'
                            )}
                          >
                            {page.slug === 'mcp'
                              ? <McpIcon className="h-[18px] w-[18px] shrink-0 sm:h-4 sm:w-4" />
                              : <Icon name={iconName!} className="h-[18px] w-[18px] shrink-0 sm:h-4 sm:w-4" />}
                            <span className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden transition-opacity duration-150 opacity-100">
                              <span className="typography-ui-label font-normal truncate">{getPageTitle(page.slug)}</span>
                              {(page.slug === 'tunnel' || page.slug === 'integrations') && (
                                <span className="shrink-0 typography-micro px-1 rounded leading-none pb-px text-[var(--status-warning)] bg-[var(--status-warning)]/10">
                                  {t('settings.view.badge.beta')}
                                </span>
                              )}
                            </span>
                          </button>
                        </TooltipTrigger>
                      </Tooltip>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="overflow-hidden transition-opacity duration-150 opacity-100">
          <div className="border-t border-border bg-background px-4 py-1.5 space-y-0.5 sm:bg-sidebar">
            {(productMode === 'developer' ? !runtimeCtx.isVSCode : pendingRestartCount > 0) && (
              <OpenCodeReloadFooterAction />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMobileStage = () => {
    if (mobileStage === 'nav') {
      return (
        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          <div className="flex h-full min-h-0 flex-col">
            <ErrorBoundary>{renderSettingsNav()}</ErrorBoundary>
          </div>
        </div>
      );
    }

    if (!activePageMeta) {
      return <div className="flex-1 bg-background" />;
    }

    if (mobileStage === 'page-sidebar') {
      if (activePageMeta.kind !== 'split') {
        // No sidebar available; fall back to direct content.
        const fallback = renderPageContent(settingsSlug);
        return (
          <div className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden bg-background">
            <ErrorBoundary><SettingsRouteBoundary>{fallback}</SettingsRouteBoundary></ErrorBoundary>
          </div>
        );
      }
      return (
        <div className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden bg-background">
          <ErrorBoundary>
            <SettingsRouteBoundary>
              {renderPageSidebar(settingsSlug, { onItemSelect: handleMobilePageSidebarItemSelect })}
            </SettingsRouteBoundary>
          </ErrorBoundary>
        </div>
      );
    }

    // page-content
    const content = renderPageContent(settingsSlug);

    return (
      <div className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden bg-background">
        <ErrorBoundary><SettingsRouteBoundary>{content}</SettingsRouteBoundary></ErrorBoundary>
      </div>
    );
  };

  const renderDesktopContent = () => {
    if (!activePageMeta || settingsSlug === 'home') {
      return null;
    }

    if (activePageMeta.kind === 'split') {
      return (
        <div className="flex h-full min-h-0 overflow-hidden">
          <div
            className={cn('border-r', runtimeCtx.isVSCode ? 'bg-background' : 'bg-sidebar')}
            style={{
              width: useWideMobileLayout ? TABLET_SETTINGS_SPLIT_SIDEBAR_WIDTH : SETTINGS_SPLIT_SIDEBAR_WIDTH,
              minWidth: useWideMobileLayout ? TABLET_SETTINGS_SPLIT_SIDEBAR_WIDTH : SETTINGS_SPLIT_SIDEBAR_WIDTH,
              borderColor: 'var(--interactive-border)',
            }}
          >
            <ErrorBoundary><SettingsRouteBoundary>{renderPageSidebar(settingsSlug, {})}</SettingsRouteBoundary></ErrorBoundary>
          </div>
          <div className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden bg-background">
            <ErrorBoundary><SettingsRouteBoundary>{renderPageContent(settingsSlug)}</SettingsRouteBoundary></ErrorBoundary>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full min-h-0 overflow-y-scroll overflow-x-hidden bg-background">
        <ErrorBoundary><SettingsRouteBoundary>{renderPageContent(settingsSlug)}</SettingsRouteBoundary></ErrorBoundary>
      </div>
    );
  };

  return (
    <div ref={containerRef} data-settings-view="true" className={cn('relative flex h-full min-h-0 flex-col overflow-hidden bg-background')}>
      {isMobile ? (
        <div
          className={cn(
            'flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-2 px-3',
            // The root nav list reads as a single quiet page — no divider and
            // no back arrow (the X on the right is the only way out); subpages
            // keep both.
            (mobileStage !== 'nav' || useWideMobileLayout) && 'border-b',
            'bg-background'
          )}
          style={mobileStage !== 'nav' || useWideMobileLayout ? { borderColor: 'var(--interactive-border)' } : undefined}
        >
          {showBackButton ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label={mobileBackButtonLabel}
              className="size-9 flex-shrink-0 rounded-md text-muted-foreground hover:text-foreground"
            >
              <Icon name="arrow-left-s" className="h-5 w-5" />
            </Button>
          ) : null}

          <div className="min-w-0 flex-1 px-2 typography-ui-label font-medium text-foreground truncate">
            {mobileStage === 'nav'
              ? t('settings.view.home.title')
              : (activePageMeta ? getPageTitle(activePageMeta.slug) : t('settings.view.home.title'))}
          </div>

          {showOpenPageSidebarButton && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleOpenPageSidebar}
              aria-label={t('settings.view.actions.openSectionList')}
              className="size-9 flex-shrink-0 rounded-md text-muted-foreground hover:text-foreground"
            >
              <Icon name="list-unordered" className="h-5 w-5" />
            </Button>
          )}

          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t('settings.view.actions.closeSettings')}
              title={closeSettingsTitle}
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="close" className="h-5 w-5" />
            </Button>
          )}
        </div>
      ) : (
        <>
          {showBackButton && (
            <div className={cn('absolute left-3 z-50', isWindowed ? 'top-2' : 'top-3')}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleBack}
                aria-label={t('settings.view.actions.back')}
                className="size-9 rounded-md text-muted-foreground hover:text-foreground"
              >
                <Icon name="arrow-left-s" className="h-5 w-5" />
              </Button>
            </div>
          )}

      {onClose && (
        <div className={cn('absolute right-0.5 z-50', isWindowed ? 'top-0.5' : 'top-1')}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('settings.view.actions.closeSettings')}
            title={closeSettingsTitle}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="close" className="h-5 w-5" />
          </Button>
        </div>
      )}
        </>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {useStackedMobileLayout ? (
          renderMobileStage()
        ) : (
          <>
            <div
              className={cn(
                'relative flex h-full min-h-0 flex-col overflow-hidden border-r',
                isDesktopApp
                  ? 'bg-sidebar'
                  : runtimeCtx.isVSCode
                    ? 'bg-background'
                    : 'bg-sidebar',
              )}
              style={{
                width: `${useWideMobileLayout ? TABLET_SETTINGS_NAV_WIDTH : SETTINGS_NAV_WIDTH}px`,
                minWidth: `${useWideMobileLayout ? TABLET_SETTINGS_NAV_WIDTH : SETTINGS_NAV_WIDTH}px`,
                borderColor: 'var(--interactive-border)',
              }}
            >
              <ErrorBoundary>
                {renderSettingsNav()}
              </ErrorBoundary>
            </div>

            <div className="flex-1 overflow-hidden bg-background">
              {renderDesktopContent()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
