import type { I18nKey, I18nParams } from '@/lib/i18n/store';
import type { ProductMode } from '@/lib/productMode';
import type { SettingsPageSlug } from '@/lib/settings/metadata';

type Translate = (key: I18nKey, params?: I18nParams) => string;

// The translated name of a settings page. Show this, not the English title in
// the page metadata.
export const getSettingsPageTitle = (slug: SettingsPageSlug, productMode: ProductMode, t: Translate): string => {
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
      // Work mode lists this page under the "Advanced" group, so the item
      // needs its own name instead of repeating the group label.
      return t('settings.view.nav.workAdvancedPage');
    case 'home':
    default:
      return t('settings.view.home.title');
  }
};
