import { describe, expect, test } from 'bun:test';

import { getToolDisplayName } from './toolHelpers';

describe('getToolDisplayName', () => {
  test('keeps the usual names outside work mode', () => {
    expect(getToolDisplayName('bash')).toBe('Shell Command');
    expect(getToolDisplayName('edit', false)).toBe('Edit File');
  });

  test('uses plain action names in work mode', () => {
    expect(getToolDisplayName('bash', true)).toBe('Run command');
    expect(getToolDisplayName('task', true)).toBe('Helper');
    expect(getToolDisplayName('openchamber_web', true)).toBe('Browser');
  });

  test('falls back to the usual name for tools work mode does not rename', () => {
    expect(getToolDisplayName('question', true)).toBe('Question');
    expect(getToolDisplayName('notion_search', true)).toBe('Notion search');
  });
});
