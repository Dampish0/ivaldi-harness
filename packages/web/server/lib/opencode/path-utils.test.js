import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';

import { pathLooksUserConfigured, mergePathValues } from './path-utils.js';

const home = os.homedir();
const delim = path.delimiter;
const posixHome = '/Users/agent';
const posixDelim = ':';

describe('pathLooksUserConfigured', () => {
  it('returns false for empty or non-string values', () => {
    expect(pathLooksUserConfigured('', home, delim)).toBe(false);
    expect(pathLooksUserConfigured(null, home, delim)).toBe(false);
    expect(pathLooksUserConfigured(undefined, home, delim)).toBe(false);
    expect(pathLooksUserConfigured(42, home, delim)).toBe(false);
  });

  it('returns false for minimal system PATH', () => {
    expect(pathLooksUserConfigured('/usr/local/bin:/usr/bin:/bin', posixHome, posixDelim)).toBe(false);
  });

  it('detects paths under home directory', () => {
    expect(pathLooksUserConfigured(`${posixHome}/.bun/bin:/usr/bin`, posixHome, posixDelim)).toBe(true);
    expect(pathLooksUserConfigured(`${posixHome}/.local/bin:/usr/bin`, posixHome, posixDelim)).toBe(true);
  });

  it('detects home directory itself', () => {
    expect(pathLooksUserConfigured(`${posixHome}:/usr/bin`, posixHome, posixDelim)).toBe(true);
  });

  it('detects well-known package manager prefixes', () => {
    expect(pathLooksUserConfigured('/opt/homebrew/bin:/usr/bin', posixHome, posixDelim)).toBe(true);
    expect(pathLooksUserConfigured('/opt/pkg/bin:/usr/bin', posixHome, posixDelim)).toBe(true);
    expect(pathLooksUserConfigured('/snap/bin:/usr/bin', posixHome, posixDelim)).toBe(true);
  });

  it('detects well-known dot-directory basenames', () => {
    expect(pathLooksUserConfigured('/some/path/.cargo/bin:/usr/bin', posixHome, posixDelim)).toBe(true);
    expect(pathLooksUserConfigured('/some/path/.nvm/versions/node/v20/bin:/usr/bin', posixHome, posixDelim)).toBe(true);
    expect(pathLooksUserConfigured('/some/path/.pyenv/shims:/usr/bin', posixHome, posixDelim)).toBe(true);
    expect(pathLooksUserConfigured('/some/path/.opencode/bin:/usr/bin', posixHome, posixDelim)).toBe(true);
  });

  it('detects Windows home and toolchain paths', () => {
    const windowsHome = 'C:\\Users\\agent';
    expect(pathLooksUserConfigured('C:\\Users\\agent\\.bun\\bin;C:\\Windows\\System32', windowsHome, ';')).toBe(true);
    expect(pathLooksUserConfigured('C:\\tools\\.cargo\\bin;C:\\Windows\\System32', windowsHome, ';')).toBe(true);
  });
});

describe('mergePathValues', () => {
  it('returns empty string for empty inputs', () => {
    expect(mergePathValues('', '', delim)).toBe('');
  });

  it('returns primary when fallback is empty', () => {
    expect(mergePathValues('/a:/b', '', posixDelim)).toBe('/a:/b');
  });

  it('returns fallback when primary is empty', () => {
    expect(mergePathValues('', '/a:/b', posixDelim)).toBe('/a:/b');
  });

  it('deduplicates segments, preserving primary order', () => {
    expect(mergePathValues('/a:/b:/c', '/b:/d:/a', posixDelim)).toBe('/a:/b:/c:/d');
  });

  it('appends all fallback segments when no overlap', () => {
    expect(mergePathValues('/a:/b', '/c:/d', posixDelim)).toBe('/a:/b:/c:/d');
  });
});
