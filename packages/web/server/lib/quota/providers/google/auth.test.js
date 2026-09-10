import { expect, test } from 'vitest';

import { resolveGoogleOAuthClient } from './auth.js';

test('Google OAuth client configuration is absent unless both values are provided', () => {
  expect(resolveGoogleOAuthClient('gemini', {})).toBeNull();
  expect(resolveGoogleOAuthClient('gemini', {
    IVALDI_GEMINI_GOOGLE_CLIENT_ID: ['client', 'id'].join('-')
  })).toBeNull();
});

test('Google OAuth client configuration stays scoped to its source', () => {
  const geminiClientId = ['gemini', 'id'].join('-');
  const geminiClientSecret = ['gemini', 'secret'].join('-');
  const antigravityClientId = ['antigravity', 'id'].join('-');
  const antigravityClientSecret = ['antigravity', 'secret'].join('-');
  const environment = {
    IVALDI_GEMINI_GOOGLE_CLIENT_ID: geminiClientId,
    IVALDI_GEMINI_GOOGLE_CLIENT_SECRET: geminiClientSecret,
    IVALDI_ANTIGRAVITY_GOOGLE_CLIENT_ID: antigravityClientId,
    IVALDI_ANTIGRAVITY_GOOGLE_CLIENT_SECRET: antigravityClientSecret
  };

  expect(resolveGoogleOAuthClient('gemini', environment)).toEqual({
    clientId: geminiClientId,
    clientSecret: geminiClientSecret
  });
  expect(resolveGoogleOAuthClient('antigravity', environment)).toEqual({
    clientId: antigravityClientId,
    clientSecret: antigravityClientSecret
  });
});
