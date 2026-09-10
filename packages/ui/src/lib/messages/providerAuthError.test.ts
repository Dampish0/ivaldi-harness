import { describe, expect, test } from 'bun:test';

import { isLikelyProviderAuthFailure } from './providerAuthError';

describe('isLikelyProviderAuthFailure', () => {
  test('recognizes direct authentication failures from provider services', () => {
    expect(isLikelyProviderAuthFailure('OpenCode Go authentication failed')).toBe(true);
    expect(isLikelyProviderAuthFailure('Authentication required')).toBe(true);
  });

  test('recognizes token and OAuth failures', () => {
    expect(isLikelyProviderAuthFailure('token refresh failed')).toBe(true);
    expect(isLikelyProviderAuthFailure('OAuth token expired')).toBe(true);
  });

  test('does not classify unrelated provider failures as authentication issues', () => {
    expect(isLikelyProviderAuthFailure('Provider request timed out')).toBe(false);
  });
});
