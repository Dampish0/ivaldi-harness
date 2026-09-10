import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { resolveIvaldiDataDirectory } from './ivaldi-data-dir.js';

let home;
beforeEach(() => { home = mkdtempSync(path.join(tmpdir(), 'ivaldi-directory-test-')); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });
const resolve = (environment = {}) => resolveIvaldiDataDirectory({ home, environment });

it('uses an Ivaldi directory for new installations', () => {
  expect(resolve()).toBe(path.join(home, '.config', 'ivaldi'));
});

it('retains existing configuration without moving or overwriting it', () => {
  const legacy = path.join(home, '.config', 'openchamber');
  mkdirSync(legacy, { recursive: true });
  writeFileSync(path.join(legacy, 'settings.json'), '{"projects":[]}');
  expect(resolve()).toBe(legacy);
  expect(readFileSync(path.join(legacy, 'settings.json'), 'utf8')).toBe('{"projects":[]}');
});

it('prefers an existing Ivaldi directory when both identities have data', () => {
  mkdirSync(path.join(home, '.config', 'openchamber'), { recursive: true });
  const current = path.join(home, '.config', 'ivaldi');
  mkdirSync(current);
  expect(resolve()).toBe(current);
});

it('honors the Ivaldi override before the legacy environment alias', () => {
  const current = path.join(home, 'custom');
  expect(resolve({ IVALDI_DATA_DIR: ` ${current} `, OPENCHAMBER_DATA_DIR: path.join(home, 'old') })).toBe(current);
  expect(resolve({ OPENCHAMBER_DATA_DIR: current })).toBe(current);
});

it('rejects a file at the data-directory path instead of silently selecting another store', () => {
  mkdirSync(path.join(home, '.config'));
  writeFileSync(path.join(home, '.config', 'ivaldi'), 'not a directory');
  expect(() => resolve()).toThrow('not a directory');
});
