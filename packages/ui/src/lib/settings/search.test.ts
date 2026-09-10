import { describe, expect, test } from 'bun:test';
import type { I18nKey } from '@/lib/i18n/store';
import { buildSettingsSearchResults } from './search';

const t = (key: I18nKey): string => key;

const runtimeCtx = {
  productMode: 'developer' as const,
  isVSCode: false,
  isWeb: true,
  isDesktop: false,
  isMobile: false,
  isDesktopLocalOrigin: false,
  isMac: false,
  isWindows: false,
  isLinux: false,
  isWindowsArm64: false,
};

describe('settings search', () => {
  test('finds the Claude Code third-party integration', () => {
    const results = buildSettingsSearchResults({
      query: 'claude',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'integrations.third-party.opencode-claude')).toBe(true);
  });

  test('finds third-party integrations by OpenChamber npm package names', () => {
    const results = buildSettingsSearchResults({
      query: '@ivaldi/opencode-cursor',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'integrations.third-party.opencode-cursor-oauth')).toBe(true);
  });

  test('work mode omits technical controls from otherwise visible pages', () => {
    const workRuntimeCtx = { ...runtimeCtx, productMode: 'work' as const };
    const searches = ['terminal', 'opencode', 'changed files', 'walkthrough', 'rendering'];

    for (const query of searches) {
      const results = buildSettingsSearchResults({
        query,
        runtimeCtx: workRuntimeCtx,
        visiblePageSlugs: ['general', 'appearance', 'chat', 'sessions'],
        t,
        getPageTitle: (page) => page,
      });

      expect(results).toEqual([]);
    }

    const smallModelResults = buildSettingsSearchResults({
      query: 'small model',
      runtimeCtx: workRuntimeCtx,
      visiblePageSlugs: ['general', 'appearance', 'chat', 'sessions'],
      t,
      getPageTitle: (page) => page,
    });

    expect(smallModelResults.some((result) => result.id === 'sessions.small-model')).toBe(false);
  });

  test('work mode routes conversation retention search results to Chat', () => {
    const results = buildSettingsSearchResults({
      query: 'retention',
      runtimeCtx: { ...runtimeCtx, productMode: 'work' as const },
      visiblePageSlugs: ['chat', 'sessions'],
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'sessions.auto-cleanup' && result.page === 'chat')).toBe(true);
    expect(results.some((result) => result.page === 'sessions')).toBe(false);
  });

  test('work mode can find the current-instance header preference', () => {
    const results = buildSettingsSearchResults({
      query: 'current instance',
      runtimeCtx: {
        ...runtimeCtx,
        productMode: 'work' as const,
        isDesktop: true,
        isWeb: false,
      },
      visiblePageSlugs: ['remote-instances'],
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'remote-instances.header-switcher')).toBe(true);
    expect(results.some((result) => result.id === 'remote-instances.switch-instance')).toBe(true);
  });
});
