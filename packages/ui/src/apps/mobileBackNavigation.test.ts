import { describe, expect, test } from 'bun:test';
import { createMobileBackNavigation } from './mobileBackNavigation';

describe('mobile Back navigation', () => {
  test('lets the newest nested route consume Back before its parent', () => {
    const navigation = createMobileBackNavigation();
    const visited: string[] = [];
    navigation.register('workspace', () => { visited.push('browser'); return true; });
    const closeFile = navigation.register('workspace', () => { visited.push('file'); return true; });
    expect(navigation.back('workspace')).toBe(true);
    expect(visited).toEqual(['file']);
    closeFile();
    expect(navigation.back('workspace')).toBe(true);
    expect(visited).toEqual(['file', 'browser']);
  });

  test('falls through when a nested route reaches its root', () => {
    const navigation = createMobileBackNavigation();
    navigation.register('workspace', () => false);
    expect(navigation.back('workspace')).toBe(false);
    navigation.register('workspace', () => true);
    navigation.register('workspace', () => false);
    expect(navigation.back('workspace')).toBe(true);
  });

  test('does not send Settings Back to a retained workspace or header menu', () => {
    const navigation = createMobileBackNavigation();
    let workspaceCalls = 0;
    let headerCalls = 0;
    navigation.register('workspace', () => { workspaceCalls += 1; return true; });
    navigation.register('chat', () => { headerCalls += 1; return true; });
    expect(navigation.back('settings')).toBe(false);
    expect(workspaceCalls).toBe(0);
    expect(headerCalls).toBe(0);
  });

  test('unregistering one screen preserves the other registrations', () => {
    const navigation = createMobileBackNavigation();
    const closeSettings = navigation.register('settings', () => true);
    navigation.register('workspace', () => true);
    closeSettings();
    expect(navigation.back('settings')).toBe(false);
    expect(navigation.back('workspace')).toBe(true);
  });
});
