import { describe, expect, test } from 'bun:test';

import { permissionModeMessages } from './permission-modes.i18n';

describe('permission mode translations', () => {
  test('all shipped locales contain the same non-empty keys', () => {
    const expectedKeys = Object.keys(permissionModeMessages.en).sort();
    expect(Object.keys(permissionModeMessages)).toHaveLength(11);

    for (const messages of Object.values(permissionModeMessages)) {
      expect(Object.keys(messages).sort()).toEqual(expectedKeys);
      for (const value of Object.values(messages)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
