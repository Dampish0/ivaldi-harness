import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { createProjectIdFromPath } from '../projects/project-id.js';
import { createSettingsRuntime } from './settings-runtime.js';
import express from 'express';
import request from 'supertest';
import { registerOpenCodeRoutes } from './routes.js';

const createRuntime = async (overrides = {}) => {
  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'oc-settings-runtime-'));
  const settingsFilePath = path.join(tempRoot, 'settings.json');
  const runtime = createSettingsRuntime({
    fsPromises,
    path,
    crypto,
    SETTINGS_FILE_PATH: settingsFilePath,
    sanitizeProjects: (projects) => Array.isArray(projects) ? projects : [],
    sanitizeSettingsUpdate: (settings) => settings,
    mergePersistedSettings: (_current, changes) => changes,
    normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
    normalizeStringArray: (values) => Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [],
    formatSettingsResponse: (settings) => settings,
    resolveDirectoryCandidate: (value) => value,
    normalizeManagedRemoteTunnelHostname: (value) => value,
    normalizeManagedRemoteTunnelPresets: (value) => value,
    normalizeManagedRemoteTunnelPresetTokens: (value) => value,
    syncManagedRemoteTunnelConfigWithPresets: async () => {},
    upsertManagedRemoteTunnelToken: async () => {},
    ...overrides,
  });

  return {
    runtime,
    settingsFilePath,
    tempRoot,
    cleanup: async () => {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    },
  };
};

describe('settings runtime', () => {
  it('notifies observers after settings writes and migrated reads', async () => {
    const observed = [];
    const { runtime, cleanup } = await createRuntime({
      onSettingsChanged: (settings) => observed.push(settings),
    });
    try {
      await runtime.persistSettings({ lifecycleHooks: [{ id: 'a' }] });
      expect(observed.at(-1)).toEqual({ lifecycleHooks: [{ id: 'a' }] });

      observed.length = 0;
      await runtime.readSettingsFromDiskMigrated();
      expect(observed.at(-1)).toMatchObject({
        lifecycleHooks: [{ id: 'a' }],
        notifyOnCompletion: true,
        notifyOnError: true,
        notifyOnQuestion: true,
        notifyOnSubtasks: true,
        notificationTemplates: expect.any(Object),
      });
    } finally {
      await cleanup();
    }
  });

  it('round-trips shared sidebar preferences through settings.json', async () => {
    const { runtime, settingsFilePath, cleanup } = await createRuntime();
    const preferences = {
      sidebarProjectDisplayMode: 'single',
      sidebarSessionGroupingMode: 'flat',
      sidebarProjectSortOrder: 'date-added',
      sidebarShowRecentSection: false,
    };
    try {
      await runtime.persistSettings(preferences);

      await expect(runtime.readSettingsFromDisk()).resolves.toEqual(preferences);
      await expect(fsPromises.readFile(settingsFilePath, 'utf8')).resolves.toBe(JSON.stringify(preferences, null, 2));
    } finally {
      await cleanup();
    }
  });

  it('allows retry after a failed save without replaying the failed change', async () => {
    let failWrite = true;
    const observed = [];
    const { runtime, settingsFilePath, cleanup } = await createRuntime({
      fsPromises: {
        ...fsPromises,
        rename: async (...args) => {
          if (failWrite) throw Object.assign(new Error('Synthetic settings write failure'), { code: 'EIO' });
          return fsPromises.rename(...args);
        },
      },
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
      onSettingsChanged: (settings) => observed.push(settings),
    });
    const previous = { defaultModel: 'qa/native', defaultAgent: 'build' };
    try {
      await fsPromises.writeFile(settingsFilePath, JSON.stringify(previous));
      await expect(runtime.persistSettings({ defaultModel: 'qa/failed' })).rejects.toThrow('Synthetic settings write failure');
      expect(JSON.parse(await fsPromises.readFile(settingsFilePath, 'utf8'))).toEqual(previous);
      expect(observed).toEqual([]);

      failWrite = false;
      await expect(runtime.persistSettings({ defaultAgent: 'plan' })).resolves.toEqual({ ...previous, defaultAgent: 'plan' });
      await expect(runtime.persistSettings({ defaultModel: 'qa/retried' })).resolves.toEqual({ defaultModel: 'qa/retried', defaultAgent: 'plan' });
      expect(JSON.parse(await fsPromises.readFile(settingsFilePath, 'utf8'))).toEqual({ defaultModel: 'qa/retried', defaultAgent: 'plan' });
      expect(observed).toEqual([{ ...previous, defaultAgent: 'plan' }, { defaultModel: 'qa/retried', defaultAgent: 'plan' }]);
    } finally {
      await cleanup();
    }
  });

  it('keeps later queued saves ordered when their predecessor fails', async () => {
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    let attempts = 0;
    const observed = [];
    const { runtime, settingsFilePath, cleanup } = await createRuntime({
      fsPromises: {
        ...fsPromises,
        rename: async (...args) => {
          attempts++;
          if (attempts === 1) {
            started.resolve();
            await release.promise;
            throw Object.assign(new Error('Synthetic queued write failure'), { code: 'EIO' });
          }
          return fsPromises.rename(...args);
        },
      },
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
      onSettingsChanged: (settings) => observed.push(settings),
    });
    let pending;
    try {
      await fsPromises.writeFile(settingsFilePath, JSON.stringify({ defaultModel: 'qa/native' }));
      const first = runtime.persistSettings({ defaultModel: 'qa/failed' });
      await started.promise;
      const second = runtime.persistSettings({ defaultAgent: 'plan' });
      const third = runtime.persistSettings({ defaultModel: 'qa/last' });
      pending = Promise.allSettled([first, second, third]);
      expect(attempts).toBe(1);
      release.resolve();
      expect(await pending).toEqual([
        { status: 'rejected', reason: expect.objectContaining({ message: 'Synthetic queued write failure' }) },
        { status: 'fulfilled', value: { defaultModel: 'qa/native', defaultAgent: 'plan' } },
        { status: 'fulfilled', value: { defaultModel: 'qa/last', defaultAgent: 'plan' } },
      ]);
      expect(attempts).toBe(3);
      expect(observed).toEqual([{ defaultModel: 'qa/native', defaultAgent: 'plan' }, { defaultModel: 'qa/last', defaultAgent: 'plan' }]);
      expect(JSON.parse(await fsPromises.readFile(settingsFilePath, 'utf8'))).toEqual({ defaultModel: 'qa/last', defaultAgent: 'plan' });
    } finally {
      release.resolve();
      await pending;
      await cleanup();
    }
  });

  it.each(['{broken', 'null', '42', '[]'])('preserves malformed settings %s until the file is repaired', async (raw) => {
    const observed = [];
    const { runtime, settingsFilePath, cleanup } = await createRuntime({
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
      onSettingsChanged: (settings) => observed.push(settings),
    });
    try {
      await fsPromises.writeFile(settingsFilePath, raw);
      await expect(runtime.persistSettings({ defaultAgent: 'plan' })).rejects.toThrow();
      await expect(runtime.readSettingsFromDiskMigrated()).rejects.toThrow();
      expect(await fsPromises.readFile(settingsFilePath, 'utf8')).toBe(raw);
      expect(observed).toEqual([]);
      await fsPromises.writeFile(settingsFilePath, JSON.stringify({ defaultModel: 'qa/native' }));
      await expect(runtime.persistSettings({ defaultAgent: 'plan' })).resolves.toEqual({ defaultModel: 'qa/native', defaultAgent: 'plan' });
    } finally {
      await cleanup();
    }
  });

  it('preserves existing settings on a read failure and permits recovery', async () => {
    let failRead = true;
    const previous = { defaultModel: 'qa/native', defaultAgent: 'build' };
    const observed = [];
    const { runtime, settingsFilePath, cleanup } = await createRuntime({
      fsPromises: {
        ...fsPromises,
        readFile: async (...args) => {
          if (failRead) throw Object.assign(new Error('Synthetic settings read failure'), { code: 'EACCES' });
          return fsPromises.readFile(...args);
        },
      },
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
      onSettingsChanged: (settings) => observed.push(settings),
    });
    try {
      await fsPromises.writeFile(settingsFilePath, JSON.stringify(previous));
      await expect(runtime.persistSettings({ defaultAgent: 'plan' })).rejects.toThrow('Synthetic settings read failure');
      await expect(runtime.readSettingsFromDiskMigrated()).rejects.toThrow('Synthetic settings read failure');
      expect(JSON.parse(await fsPromises.readFile(settingsFilePath, 'utf8'))).toEqual(previous);
      expect(observed).toEqual([]);
      failRead = false;
      await expect(runtime.persistSettings({ defaultAgent: 'plan' })).resolves.toEqual({ ...previous, defaultAgent: 'plan' });
    } finally {
      await cleanup();
    }
  });

  it('serializes a migration read with a later save so neither replaces the other', async () => {
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    let reads = 0;
    const { runtime, settingsFilePath, cleanup } = await createRuntime({
      fsPromises: {
        ...fsPromises,
        readFile: async (...args) => {
          reads++;
          if (reads === 1) { started.resolve(); await release.promise; }
          return fsPromises.readFile(...args);
        },
      },
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
    });
    let pending;
    try {
      await fsPromises.writeFile(settingsFilePath, JSON.stringify({ defaultModel: 'qa/native' }));
      const migration = runtime.readSettingsFromDiskMigrated();
      await started.promise;
      const save = runtime.persistSettings({ defaultAgent: 'plan' });
      pending = Promise.allSettled([migration, save]);
      await new Promise(resolve => setImmediate(resolve));
      expect(reads).toBe(1);
      release.resolve();
      const outcomes = await pending;
      expect(outcomes.map(outcome => outcome.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(JSON.parse(await fsPromises.readFile(settingsFilePath, 'utf8'))).toMatchObject({
        defaultModel: 'qa/native', defaultAgent: 'plan', notifyOnCompletion: true,
      });
    } finally {
      release.resolve();
      await pending;
      await cleanup();
    }
  });

  it('keeps Settings HTTP failures recoverable without restarting the host', async () => {
    let failWrite = true;
    const { runtime, settingsFilePath, cleanup } = await createRuntime({
      fsPromises: {
        ...fsPromises,
        rename: async (...args) => {
          if (failWrite) throw Object.assign(new Error('Synthetic HTTP settings failure'), { code: 'EIO' });
          return fsPromises.rename(...args);
        },
      },
      mergePersistedSettings: (current, changes) => ({ ...current, ...changes }),
    });
    const app = express();
    app.use(express.json());
    registerOpenCodeRoutes(app, { ...runtime, formatSettingsResponse: settings => settings });
    try {
      await fsPromises.writeFile(settingsFilePath, JSON.stringify({ defaultModel: 'qa/native' }));
      await request(app).put('/api/config/settings').send({ defaultAgent: 'plan' }).expect(500);
      expect(JSON.parse(await fsPromises.readFile(settingsFilePath, 'utf8'))).toEqual({ defaultModel: 'qa/native' });
      failWrite = false;
      const saved = await request(app).put('/api/config/settings').send({ defaultAgent: 'plan' }).expect(200);
      expect(saved.body).toEqual({ defaultModel: 'qa/native', defaultAgent: 'plan' });
      await fsPromises.writeFile(settingsFilePath, '{broken');
      const failedRead = await request(app).get('/api/config/settings').expect(500);
      expect(failedRead.body).toEqual({ error: 'Failed to read settings' });
      expect(await fsPromises.readFile(settingsFilePath, 'utf8')).toBe('{broken');
      await fsPromises.writeFile(settingsFilePath, JSON.stringify(saved.body));
      const restored = await request(app).get('/api/config/settings').expect(200);
      expect(restored.body).toMatchObject(saved.body);
      expect(restored.body.notifyOnCompletion).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it.skipIf(process.platform === 'win32')('writes settings with restrictive directory and file permissions', async () => {
    const { runtime, settingsFilePath, tempRoot, cleanup } = await createRuntime();
    try {
      await runtime.writeSettingsToDisk({ desktopUiPassword: 'secret' });

      expect((await fsPromises.stat(tempRoot)).mode & 0o777).toBe(0o700);
      expect((await fsPromises.stat(settingsFilePath)).mode & 0o777).toBe(0o600);
    } finally {
      await cleanup();
    }
  });

  it('only remaps project plan paths within the migrated storage directory', async () => {
    const { runtime, settingsFilePath, tempRoot, cleanup } = await createRuntime();
    try {
      const projectPath = path.join(tempRoot, 'project');
      const oldProjectId = 'legacy-project-id';
      const newProjectId = createProjectIdFromPath(projectPath);
      const projectsRoot = path.join(path.dirname(settingsFilePath), 'projects');
      const oldStorageDir = path.join(projectsRoot, oldProjectId);
      const newStorageDir = path.join(projectsRoot, newProjectId);
      const siblingStorageDir = `${oldStorageDir}-sibling`;

      await fsPromises.mkdir(projectPath, { recursive: true });
      await fsPromises.mkdir(projectsRoot, { recursive: true });
      await fsPromises.writeFile(
        settingsFilePath,
        JSON.stringify({
          projects: [{ id: oldProjectId, path: projectPath, addedAt: 1, lastOpenedAt: 1 }],
          activeProjectId: oldProjectId,
        }, null, 2),
        'utf8',
      );
      await fsPromises.writeFile(
        path.join(projectsRoot, `${oldProjectId}.json`),
        JSON.stringify({
          projectPlanFiles: [
            { id: 'inside', path: path.join(oldStorageDir, 'plans', 'inside.md') },
            { id: 'sibling', path: path.join(siblingStorageDir, 'plans', 'outside.md') },
          ],
        }, null, 2),
        'utf8',
      );

      await runtime.readSettingsFromDiskMigrated();

      const migratedConfig = JSON.parse(await fsPromises.readFile(path.join(projectsRoot, `${newProjectId}.json`), 'utf8'));
      expect(migratedConfig.projectPlanFiles).toEqual([
        { id: 'inside', path: path.join(newStorageDir, 'plans', 'inside.md') },
        { id: 'sibling', path: path.join(siblingStorageDir, 'plans', 'outside.md') },
      ]);
    } finally {
      await cleanup();
    }
  });

  it.skipIf(process.platform !== 'win32')('falls back when Windows blocks atomic settings replacement', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'oc-settings-runtime-'));
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    const wrappedFs = {
      ...fsPromises,
      rename: async () => {
        const error = new Error('operation not permitted');
        error.code = 'EPERM';
        throw error;
      },
    };
    const runtime = createSettingsRuntime({
      fsPromises: wrappedFs,
      path,
      crypto,
      SETTINGS_FILE_PATH: settingsFilePath,
      sanitizeProjects: (projects) => Array.isArray(projects) ? projects : [],
      sanitizeSettingsUpdate: (settings) => settings,
      mergePersistedSettings: (_current, changes) => changes,
      normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
      normalizeStringArray: (values) => Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [],
      formatSettingsResponse: (settings) => settings,
      resolveDirectoryCandidate: (value) => value,
      normalizeManagedRemoteTunnelHostname: (value) => value,
      normalizeManagedRemoteTunnelPresets: (value) => value,
      normalizeManagedRemoteTunnelPresetTokens: (value) => value,
      syncManagedRemoteTunnelConfigWithPresets: async () => {},
      upsertManagedRemoteTunnelToken: async () => {},
    });

    try {
      await runtime.writeSettingsToDisk({ theme: 'dark' });

      await expect(fsPromises.readFile(settingsFilePath, 'utf8')).resolves.toBe(JSON.stringify({ theme: 'dark' }, null, 2));
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('cleans up orphaned settings.json.tmp files during startup migration', async () => {
    const { runtime, settingsFilePath, tempRoot, cleanup } = await createRuntime();
    try {
      const settingsDir = path.dirname(settingsFilePath);
      const orphan1 = path.join(settingsDir, 'settings.json.tmp-1234-11111-abc');
      const orphan2 = path.join(settingsDir, 'settings.json.tmp-5678-22222-def');
      const unrelated = path.join(settingsDir, 'other-file.json');

      await fsPromises.writeFile(orphan1, '{"broken": true}', 'utf8');
      await fsPromises.writeFile(orphan2, '{"broken": true}', 'utf8');
      await fsPromises.writeFile(unrelated, '{"keep": true}', 'utf8');
      await fsPromises.writeFile(settingsFilePath, '{"theme": "light"}', 'utf8');

      await runtime.readSettingsFromDiskMigrated();

      const files = await fsPromises.readdir(settingsDir);
      expect(files).toContain('settings.json');
      expect(files).toContain('other-file.json');
      expect(files).not.toContain('settings.json.tmp-1234-11111-abc');
      expect(files).not.toContain('settings.json.tmp-5678-22222-def');
    } finally {
      await cleanup();
    }
  });

  it('removes temp file when writeSettingsToDisk encounters a write error', async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'oc-settings-runtime-'));
    const settingsFilePath = path.join(tempRoot, 'settings.json');
    let capturedTmp = null;
    const wrappedFs = {
      ...fsPromises,
      rename: async (src, dst) => {
        capturedTmp = src;
        const error = new Error('unexpected disk failure');
        error.code = 'EIO';
        throw error;
      },
    };
    const runtime = createSettingsRuntime({
      fsPromises: wrappedFs,
      path,
      crypto,
      SETTINGS_FILE_PATH: settingsFilePath,
      sanitizeProjects: (projects) => Array.isArray(projects) ? projects : [],
      sanitizeSettingsUpdate: (settings) => settings,
      mergePersistedSettings: (_current, changes) => changes,
      normalizeSettingsPaths: (settings) => ({ settings, changed: false }),
      normalizeStringArray: (values) => Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [],
      formatSettingsResponse: (settings) => settings,
      resolveDirectoryCandidate: (value) => value,
      normalizeManagedRemoteTunnelHostname: (value) => value,
      normalizeManagedRemoteTunnelPresets: (value) => value,
      normalizeManagedRemoteTunnelPresetTokens: (value) => value,
      syncManagedRemoteTunnelConfigWithPresets: async () => {},
      upsertManagedRemoteTunnelToken: async () => {},
    });

    try {
      await expect(runtime.writeSettingsToDisk({ theme: 'dark' })).rejects.toThrow('unexpected disk failure');
      expect(capturedTmp).toBeTruthy();
      const files = await fsPromises.readdir(tempRoot);
      expect(files.some((f) => f.startsWith('settings.json.tmp-'))).toBe(false);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
