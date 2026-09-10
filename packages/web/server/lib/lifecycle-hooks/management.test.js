import { describe, expect, it, vi } from 'vitest';

import { createLifecycleHookManagementService } from './management.js';

const baseHook = (overrides = {}) => ({
  id: 'example',
  event: 'UserPromptSubmit',
  command: ['node', 'hook.mjs'],
  enabled: false,
  timeoutMs: 10_000,
  failureMode: 'warn',
  ...overrides,
});

const createHarness = ({ ready = true } = {}) => {
  let hooks = [];
  const order = [];
  const runtime = {
    getConfigurationStatus: vi.fn(() => ({ ready })),
    snapshotHooks: vi.fn(() => hooks.map((hook) => ({ ...hook, command: [...hook.command] }))),
    getRecentExecutions: vi.fn(() => [{ hookId: 'recent', ok: true }]),
    replaceHooks: vi.fn((next) => {
      order.push('replace');
      hooks = next.map((hook) => ({ ...hook, command: [...hook.command] }));
      return hooks;
    }),
    testHook: vi.fn(async (hook, payload) => ({ hookId: hook.id, payload, ok: true })),
  };
  const persistSettings = vi.fn(async ({ lifecycleHooks }) => {
    order.push('persist');
    return { lifecycleHooks };
  });
  const service = createLifecycleHookManagementService({
    getLifecycleHookRuntime: () => runtime,
    persistSettings,
  });
  return { service, runtime, persistSettings, order };
};

describe('lifecycle hook management service', () => {
  it('fails closed for saved configuration operations when configuration is unavailable', () => {
    const { service } = createHarness({ ready: false });
    expect(() => service.list()).toThrow('Lifecycle hook configuration is unavailable');
  });

  it('creates, updates, and deletes exact hook IDs through full-list validation', async () => {
    const { service, persistSettings, order } = createHarness();

    let hooks = await service.create(baseHook());
    expect(hooks).toEqual([baseHook()]);
    expect(order).toEqual(['persist', 'replace']);

    hooks = await service.update('example', { enabled: true, timeoutMs: 500 });
    expect(hooks[0]).toMatchObject({ id: 'example', enabled: true, timeoutMs: 500 });

    await expect(service.create(baseHook())).rejects.toMatchObject({
      statusCode: 400,
      code: 'LIFECYCLE_HOOK_CONFIG_INVALID',
      issues: [expect.objectContaining({ code: 'DUPLICATE_ID' })],
    });

    await expect(service.remove('example')).resolves.toEqual({
      deleted: true,
      hookId: 'example',
      hooks: [],
    });
    expect(persistSettings).toHaveBeenCalledTimes(3);
  });

  it('does not persist or replace active hooks when a mutation is invalid', async () => {
    const { service, runtime, persistSettings } = createHarness();
    await service.create(baseHook());
    persistSettings.mockClear();
    runtime.replaceHooks.mockClear();

    await expect(service.update('example', { failureMode: 'block', event: 'ChatStart' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'LIFECYCLE_HOOK_CONFIG_INVALID',
    });
    expect(persistSettings).not.toHaveBeenCalled();
    expect(runtime.replaceHooks).not.toHaveBeenCalled();
  });

  it('tests a saved disabled hook without changing configuration', async () => {
    const { service, runtime, persistSettings } = createHarness();
    await service.create(baseHook());
    persistSettings.mockClear();
    runtime.replaceHooks.mockClear();

    await expect(service.testSaved('example', { directory: 'C:/repo' })).resolves.toMatchObject({
      hookId: 'example',
      ok: true,
      payload: { directory: 'C:/repo' },
    });
    expect(runtime.testHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'example', enabled: false }), { directory: 'C:/repo' });
    expect(persistSettings).not.toHaveBeenCalled();
    expect(runtime.replaceHooks).not.toHaveBeenCalled();
  });

  it('serializes concurrent mutations so one create cannot erase another', async () => {
    const { service } = createHarness();

    await Promise.all([
      service.create(baseHook({ id: 'first' })),
      service.create(baseHook({ id: 'second' })),
    ]);

    expect(service.list().hooks.map((hook) => hook.id)).toEqual(['first', 'second']);
  });
});
