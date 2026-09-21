import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSettingsRuntime } from '../../../../packages/web/server/lib/opencode/settings-runtime.js';

/** Real server persistence with synthetic settings and controlled I/O failures. */
export async function createSettingsStorageFixture(seed) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ivaldi-native-settings-'));
  const file = path.join(root, 'settings.json');
  await fs.writeFile(file, JSON.stringify(seed));
  let committed = { ...seed };
  let fault = null;
  const counts = { writeAttempts: 0, writeFailures: 0, readFailures: 0 };
  const runtime = createSettingsRuntime({
    fsPromises: {
      ...fs,
      readFile: async (target, ...args) => {
        if (target === file && fault === 'read') {
          fault = null; counts.readFailures++;
          throw Object.assign(new Error('Synthetic Settings read failure'), { code: 'EACCES' });
        }
        return fs.readFile(target, ...args);
      },
      rename: async (source, target) => {
        if (target === file) {
          counts.writeAttempts++;
          if (fault === 'write') {
            fault = null; counts.writeFailures++;
            throw Object.assign(new Error('Synthetic Settings write failure'), { code: 'EIO' });
          }
        }
        return fs.rename(source, target);
      },
    },
    path, crypto, SETTINGS_FILE_PATH: file,
    sanitizeProjects: projects => projects ?? [],
    sanitizeSettingsUpdate: settings => settings,
    mergePersistedSettings: (current, changes) => {
      const next = { ...current, ...changes };
      for (const key of ['defaultModel', 'defaultVariant', 'defaultAgent']) if (changes[key] === '') delete next[key];
      return next;
    },
    normalizeSettingsPaths: settings => ({ settings, changed: false }),
    normalizeStringArray: values => values ?? [],
    formatSettingsResponse: settings => settings,
    resolveDirectoryCandidate: value => value,
    normalizeManagedRemoteTunnelHostname: value => value,
    normalizeManagedRemoteTunnelPresets: value => value,
    normalizeManagedRemoteTunnelPresetTokens: value => value,
    syncManagedRemoteTunnelConfigWithPresets: async () => {},
    upsertManagedRemoteTunnelToken: async () => {},
    onSettingsChanged: settings => { committed = settings; },
  });
  return {
    read: runtime.readSettingsFromDiskMigrated,
    write: runtime.persistSettings,
    control: async command => {
      if (command === 'write' || command === 'read') fault = command;
      else if (command === 'corrupt') await fs.writeFile(file, '{synthetic-invalid-json');
      else if (command === 'repair') await fs.writeFile(file, JSON.stringify(committed));
      else throw new Error('Unsupported Settings storage control');
    },
    stats: () => ({ ...counts, defaults: { defaultModel: committed.defaultModel ?? '', defaultVariant: committed.defaultVariant ?? '', defaultAgent: committed.defaultAgent ?? '', showReasoning: committed.showReasoning } }),
    close: async () => {
      if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ivaldi-native-settings-')) throw new Error('Unexpected Settings fixture directory');
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
