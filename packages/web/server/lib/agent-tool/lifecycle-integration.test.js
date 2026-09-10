import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgentToolRuntime } from './runtime.js';
import { createLifecycleHookManagementService } from '../lifecycle-hooks/management.js';
import { createOpenChamberControlService } from '../openchamber-control/service.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('managed agent lifecycle hook integration', () => {
  it('persists, activates, and dry-runs a hook through the managed openchamber action path', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ivaldi-agent-lifecycle-'));
    temporaryDirectories.push(dataDir);
    let settings = {};
    let hooks = [];
    const testHook = vi.fn(async (hook, payload) => ({ hookId: hook.id, ok: true, payload }));
    const lifecycleRuntime = {
      getConfigurationStatus: () => ({ ready: true }),
      snapshotHooks: () => hooks.map((hook) => ({ ...hook, command: [...hook.command] })),
      getRecentExecutions: () => [],
      replaceHooks: (next) => {
        hooks = next.map((hook) => ({ ...hook, command: [...hook.command] }));
        return hooks;
      },
      testHook,
    };
    const lifecycleHooks = createLifecycleHookManagementService({
      getLifecycleHookRuntime: () => lifecycleRuntime,
      persistSettings: async (changes) => {
        settings = { ...settings, ...changes };
      },
    });
    const controlService = createOpenChamberControlService({
      readSettingsFromDiskMigrated: async () => settings,
      sanitizeProjects: (projects) => projects,
      buildOpenCodeUrl: () => 'http://127.0.0.1:4096/',
      getOpenCodeAuthHeaders: () => ({}),
      waitForOpenCodeReady: async () => {},
      sessionService: {},
      scheduledTaskService: {},
      lifecycleHooks,
    });
    const agentTool = createAgentToolRuntime({
      crypto,
      fsPromises: fs,
      path,
      dataDir,
      getActivePort: () => 3901,
      executeAction: (...args) => controlService.execute(...args),
      env: {},
    });

    const created = await agentTool.execute({
      tool: 'openchamber',
      sessionId: 'ses_agent',
      contextDirectory: 'C:/repo',
      input: {
        action: 'lifecycle.create',
        hookId: 'agent-created',
        event: 'ChatEnd',
        command: ['node', 'cleanup.mjs'],
        enabled: true,
      },
    });

    expect(created).toMatchObject({
      ok: true,
      action: 'lifecycle.create',
      data: {
        created: true,
        hook: { id: 'agent-created', event: 'ChatEnd', enabled: true },
      },
    });
    expect(settings.lifecycleHooks).toEqual([
      {
        id: 'agent-created',
        event: 'ChatEnd',
        command: ['node', 'cleanup.mjs'],
        enabled: true,
        timeoutMs: 10_000,
        failureMode: 'warn',
      },
    ]);
    expect(hooks).toEqual(settings.lifecycleHooks);

    const tested = await agentTool.execute({
      tool: 'openchamber',
      sessionId: 'ses_agent',
      contextDirectory: 'C:/repo',
      input: { action: 'lifecycle.test', hookId: 'agent-created' },
    });

    expect(tested).toMatchObject({
      ok: true,
      action: 'lifecycle.test',
      data: { hookId: 'agent-created', result: { hookId: 'agent-created', ok: true } },
    });
    expect(testHook).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-created' }),
      { directory: 'C:/repo', sessionId: 'ses_agent' },
    );
  });
});
