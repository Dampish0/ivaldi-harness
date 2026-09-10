import { describe, expect, test } from 'bun:test';

import {
  getSettingsPageKeywordsInProductMode,
  isComposerCommandVisibleInProductMode,
  isComposerSkillVisibleInProductMode,
  isShortcutVisibleInProductMode,
  isSettingsPageAvailableInProductMode,
  isSettingsPageReachableInProductMode,
  isSettingsPageVisibleInProductMode,
  isWorkAdvancedSettingsDetailPage,
} from './productMode';

describe('isSettingsPageVisibleInProductMode', () => {
  test('keeps the curated work settings navigation visible', () => {
    expect(isSettingsPageVisibleInProductMode('work', 'general')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('work', 'projects')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('work', 'remote-instances')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('work', 'integrations')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('work', 'sessions')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('work', 'mcp')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('work', 'plugins')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('work', 'skills.installed')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('work', 'advanced')).toBe(true);
  });

  test('hides technical detail pages from the work top-level navigation', () => {
    expect(isSettingsPageVisibleInProductMode('work', 'git')).toBe(false);
    expect(isSettingsPageVisibleInProductMode('work', 'commands')).toBe(false);
    expect(isSettingsPageVisibleInProductMode('work', 'lifecycle-hooks')).toBe(false);
    expect(isSettingsPageVisibleInProductMode('work', 'providers')).toBe(false);
    expect(isSettingsPageVisibleInProductMode('work', 'agents')).toBe(false);
    expect(isSettingsPageVisibleInProductMode('work', 'behavior')).toBe(false);
    expect(isSettingsPageVisibleInProductMode('work', 'tunnel')).toBe(false);
  });

  test('keeps developer controls reachable while avoiding duplicate top-level destinations', () => {
    expect(isSettingsPageVisibleInProductMode('developer', 'git')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('developer', 'commands')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('developer', 'lifecycle-hooks')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('developer', 'skills.installed')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('developer', 'skills.catalog')).toBe(false);
    expect(isSettingsPageReachableInProductMode('developer', 'skills.catalog')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('developer', 'tunnel')).toBe(true);
    expect(isSettingsPageVisibleInProductMode('developer', 'advanced')).toBe(false);
  });
});

describe('work settings reachability', () => {
  test('keeps technical detail pages reachable behind Advanced', () => {
    for (const slug of ['providers', 'agents', 'behavior', 'commands', 'lifecycle-hooks', 'shortcuts'] as const) {
      expect(isSettingsPageReachableInProductMode('work', slug)).toBe(true);
      expect(isWorkAdvancedSettingsDetailPage(slug)).toBe(true);
    }
    for (const slug of ['mcp', 'plugins', 'skills.installed'] as const) {
      expect(isSettingsPageReachableInProductMode('work', slug)).toBe(true);
      expect(isWorkAdvancedSettingsDetailPage(slug)).toBe(false);
    }
    expect(isSettingsPageReachableInProductMode('work', 'skills.catalog')).toBe(true);
    expect(isSettingsPageReachableInProductMode('work', 'remote-instances')).toBe(true);
    expect(isWorkAdvancedSettingsDetailPage('remote-instances')).toBe(false);
    expect(isWorkAdvancedSettingsDetailPage('skills.catalog')).toBe(false);
    expect(isSettingsPageReachableInProductMode('work', 'git')).toBe(false);
    expect(isWorkAdvancedSettingsDetailPage('projects')).toBe(false);
  });

  test('makes About available to work outside VS Code without changing base availability elsewhere', () => {
    expect(isSettingsPageAvailableInProductMode('work', 'about', false, { isVSCode: false })).toBe(true);
    expect(isSettingsPageAvailableInProductMode('work', 'about', false, { isVSCode: true })).toBe(false);
    expect(isSettingsPageAvailableInProductMode('developer', 'about', false, { isVSCode: false })).toBe(false);
  });
});

describe('isComposerCommandVisibleInProductMode', () => {
  test('keeps task-oriented commands available in work mode', () => {
    expect(isComposerCommandVisibleInProductMode('work', 'summary')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('work', 'catch-up')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('work', 'schedule-task')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('work', 'plan')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('work', 'goal')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('work', 'weigh')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('work', 'btw')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('work', 'compact')).toBe(true);
  });

  test('hides developer and OpenCode maintenance commands from work mode', () => {
    expect(isComposerCommandVisibleInProductMode('work', 'explore')).toBe(false);
    expect(isComposerCommandVisibleInProductMode('work', 'debug')).toBe(false);
    expect(isComposerCommandVisibleInProductMode('work', 'workspace-review')).toBe(false);
    expect(isComposerCommandVisibleInProductMode('work', 'handoff-review')).toBe(false);
    expect(isComposerCommandVisibleInProductMode('work', 'plan-feature')).toBe(false);
    expect(isComposerCommandVisibleInProductMode('work', 'craft-goal')).toBe(false);
    expect(isComposerCommandVisibleInProductMode('work', 'customize-opencode')).toBe(false);
  });

  test('keeps command discoverability unchanged in developer mode', () => {
    expect(isComposerCommandVisibleInProductMode('developer', 'compact')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('developer', 'debug')).toBe(true);
    expect(isComposerCommandVisibleInProductMode('developer', 'customize-opencode')).toBe(true);
  });
});

describe('isComposerSkillVisibleInProductMode', () => {
  test('hides product-maintenance skills from Work while keeping ordinary skills available', () => {
    expect(isComposerSkillVisibleInProductMode('work', 'customize-opencode')).toBe(false);
    expect(isComposerSkillVisibleInProductMode('work', 'meeting-notes')).toBe(true);
    expect(isComposerSkillVisibleInProductMode('developer', 'customize-opencode')).toBe(true);
  });
});

describe('work mode technical discovery filters', () => {
  test('hides developer-only shortcut actions in work mode', () => {
    for (const id of ['new_chat_worktree', 'open_right_sidebar_git', 'toggle_terminal', 'toggle_terminal_expanded']) {
      expect(isShortcutVisibleInProductMode('work', id)).toBe(false);
      expect(isShortcutVisibleInProductMode('developer', id)).toBe(true);
    }
    expect(isShortcutVisibleInProductMode('work', 'new_chat')).toBe(true);
  });

  test('removes developer-only page keywords from work command-palette search text', () => {
    expect(getSettingsPageKeywordsInProductMode('work', 'projects', ['project', 'worktree', 'repository']))
      .toEqual(['project', 'repository']);
    expect(getSettingsPageKeywordsInProductMode('work', 'appearance', ['theme', 'terminal', 'font']))
      .toEqual(['theme', 'font']);
    expect(getSettingsPageKeywordsInProductMode('developer', 'projects', ['project', 'worktree']))
      .toEqual(['project', 'worktree']);
  });
});
