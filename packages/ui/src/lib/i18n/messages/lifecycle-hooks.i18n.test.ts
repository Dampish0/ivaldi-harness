import { describe, expect, test } from 'bun:test';

import { lifecycleHooksI18n } from './lifecycle-hooks.i18n';

const locales = ['en', 'de', 'fr', 'es', 'ja', 'pt-BR', 'uk', 'ko', 'pl', 'zh-CN', 'zh-TW'] as const;
const englishKeys = Object.keys(lifecycleHooksI18n.en);

describe('lifecycle hook translations', () => {
  test('provides every lifecycle-hook key in every supported locale', () => {
    for (const locale of locales) {
      const messages = lifecycleHooksI18n[locale];
      expect(Object.keys(messages).sort()).toEqual([...englishKeys].sort());
      for (const value of Object.values(messages)) {
        expect(value).toBeTruthy();
      }
    }
  });
});
