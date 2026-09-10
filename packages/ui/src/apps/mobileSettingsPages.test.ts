import { describe, expect, test } from 'bun:test';

import { MOBILE_SETTINGS_PAGES } from './mobileSettingsPages';

describe('mobile Settings reachability', () => {
  test('keeps lifecycle hook management reachable from Work Advanced', () => {
    expect(MOBILE_SETTINGS_PAGES).toContain('advanced');
    expect(MOBILE_SETTINGS_PAGES).toContain('lifecycle-hooks');
  });
});
