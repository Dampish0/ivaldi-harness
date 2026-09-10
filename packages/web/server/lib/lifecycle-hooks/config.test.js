import { describe, expect, it } from 'vitest';

import {
  hasEnabledLifecycleHooks,
  hasEnabledLifecycleHooksForEvent,
  sanitizeLifecycleHooks,
  validateLifecycleHooks,
} from './config.js';

describe('lifecycle hook config', () => {
  it('normalizes supported user prompt hooks', () => {
    expect(sanitizeLifecycleHooks([
      {
        id: ' check-prompt ',
        event: 'UserPromptSubmit',
        command: [' node ', ' hook.mjs '],
        failureMode: 'block',
        timeoutMs: 2500,
      },
    ])).toEqual([
      {
        id: 'check-prompt',
        event: 'UserPromptSubmit',
        command: ['node', ' hook.mjs '],
        enabled: true,
        timeoutMs: 2500,
        failureMode: 'block',
      },
    ]);
  });

  it('drops malformed, duplicate, unsupported, and unsafe command entries', () => {
    expect(sanitizeLifecycleHooks([
      { id: 'ok', event: 'UserPromptSubmit', command: ['node', 'hook.mjs'] },
      { id: 'ok', event: 'UserPromptSubmit', command: ['node', 'other.mjs'] },
      { id: 'unsupported', event: 'ExternalEventReceived', command: ['node', 'hook.mjs'] },
      { id: 'passive-block', event: 'PermissionRequest', command: ['node'], failureMode: 'block' },
      { id: 'shell-string', event: 'UserPromptSubmit', command: 'node hook.mjs' },
      { id: 'bad-timeout', event: 'UserPromptSubmit', command: ['node'], timeoutMs: 5 },
      { id: 'bad-mode', event: 'UserPromptSubmit', command: ['node'], failureMode: 'ignore' },
      { id: 'bad-enabled', event: 'UserPromptSubmit', command: ['node'], enabled: 'false' },
      { id: 'bad id', event: 'UserPromptSubmit', command: ['node'] },
    ])).toEqual([
      {
        id: 'ok',
        event: 'UserPromptSubmit',
        command: ['node', 'hook.mjs'],
        enabled: true,
        timeoutMs: 10_000,
        failureMode: 'warn',
      },
    ]);
  });

  it('accepts authoritative passive events with warn behavior', () => {
    expect(sanitizeLifecycleHooks([
      { id: 'chat', event: 'ChatStart', command: ['node'] },
      { id: 'permission', event: 'PermissionRequest', command: ['node'] },
      { id: 'denied', event: 'PermissionDenied', command: ['node'] },
      { id: 'compact', event: 'BeforeCompact', command: ['node'] },
    ])?.map((hook) => [hook.event, hook.failureMode])).toEqual([
      ['ChatStart', 'warn'],
      ['PermissionRequest', 'warn'],
      ['PermissionDenied', 'warn'],
      ['BeforeCompact', 'warn'],
    ]);
  });

  it('only reports enabled hooks as active', () => {
    expect(hasEnabledLifecycleHooks([{ id: 'a', event: 'UserPromptSubmit', command: ['node'], enabled: false }])).toBe(false);
    expect(hasEnabledLifecycleHooks([{ id: 'a', event: 'UserPromptSubmit', command: ['node'] }])).toBe(true);
    expect(hasEnabledLifecycleHooks('invalid')).toBe(false);
    expect(hasEnabledLifecycleHooksForEvent([{ id: 'a', event: 'UserPromptSubmit', command: ['node'] }], 'UserPromptSubmit')).toBe(true);
    expect(hasEnabledLifecycleHooksForEvent([{ id: 'a', event: 'UserPromptSubmit', command: ['node'] }], 'BeforeToolCall')).toBe(false);
  });

  it('returns explicit validation issues for API writes instead of silently dropping bad hooks', () => {
    expect(validateLifecycleHooks([
      { id: 'ok', event: 'UserPromptSubmit', command: ['node', 'hook.mjs'] },
      { id: 'ok', event: 'UserPromptSubmit', command: ['node', 'duplicate.mjs'] },
      { id: 'bad id', event: 'UserPromptSubmit', command: ['node'] },
    ])).toMatchObject({
      ok: false,
      hooks: [
        {
          id: 'ok',
          event: 'UserPromptSubmit',
          command: ['node', 'hook.mjs'],
          enabled: true,
          timeoutMs: 10_000,
          failureMode: 'warn',
        },
      ],
      issues: [
        { index: 1, code: 'DUPLICATE_ID' },
        { index: 2, code: 'INVALID_ID' },
      ],
    });
  });

  it('rejects block mode for passive events', () => {
    expect(validateLifecycleHooks([
      { id: 'permission', event: 'PermissionRequest', command: ['node'], failureMode: 'block' },
    ])).toMatchObject({
      ok: false,
      hooks: [],
      issues: [{ index: 0, code: 'INVALID_FAILURE_MODE' }],
    });
  });
});
