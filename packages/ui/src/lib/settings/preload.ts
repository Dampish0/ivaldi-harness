// Settings stays out of the eager app bootstrap, but in development each lazy
// route otherwise pays Vite + Fast Refresh transform cost on the first click.
// Warming these modules after the shell is idle keeps startup lean while making
// navigation inside an opened Settings window use the browser/module cache.
// This list is only a performance hint: route rendering remains the source of
// truth, so a missing future entry can only make that route cold.
const SETTINGS_ROUTE_PRELOADERS = [
  () => import('@/components/sections/openchamber/OpenChamberPage'),
  () => import('@/components/sections/projects/ProjectsSidebar'),
  () => import('@/components/sections/projects/ProjectsPage'),
  () => import('@/components/sections/git-identities/GitPage'),
  () => import('@/components/sections/integrations/IntegrationsPage'),
  () => import('@/components/sections/remote-instances/RemoteInstancesPage'),
  () => import('@/components/sections/providers/ProvidersSidebar'),
  () => import('@/components/sections/providers/ProvidersPage'),
  () => import('@/components/sections/agents/AgentsSidebar'),
  () => import('@/components/sections/agents/AgentsPage'),
  () => import('@/components/sections/behavior/BehaviorPage'),
  () => import('@/components/sections/commands/CommandsSidebar'),
  () => import('@/components/sections/commands/CommandsPage'),
  () => import('@/components/sections/lifecycle-hooks/LifecycleHooksPage'),
  () => import('@/components/sections/mcp/McpSidebar'),
  () => import('@/components/sections/mcp/McpPage'),
  () => import('@/components/sections/plugins'),
  () => import('@/components/sections/skills/SkillsSidebar'),
  () => import('@/components/sections/skills/SkillsPage'),
  () => import('@/components/sections/magic-prompts/MagicPromptsSidebar'),
  () => import('@/components/sections/magic-prompts/MagicPromptsPage'),
  () => import('@/components/sections/snippets/SnippetsSidebar'),
  () => import('@/components/sections/snippets/SnippetsPage'),
  () => import('@/components/sections/usage/UsageSidebar'),
  () => import('@/components/sections/usage/UsagePage'),
  () => import('@/components/sections/openchamber/AboutSettings'),
  () => import('@/components/sections/openchamber/WorkAdvancedSettingsPage'),
] as const;

let settingsRoutePreloadPromise: Promise<void> | null = null;

export function preloadSettingsRouteModules(): Promise<void> {
  if (settingsRoutePreloadPromise) {
    return settingsRoutePreloadPromise;
  }

  settingsRoutePreloadPromise = (async () => {
    const batchSize = 4;
    for (let index = 0; index < SETTINGS_ROUTE_PRELOADERS.length; index += batchSize) {
      const batch = SETTINGS_ROUTE_PRELOADERS.slice(index, index + batchSize);
      await Promise.allSettled(batch.map((load) => load()));
    }
  })();

  return settingsRoutePreloadPromise;
}
