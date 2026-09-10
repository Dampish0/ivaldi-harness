import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureIvaldiOriginalSkills } from './ivaldi-original-skills.js';

const tempRoots = [];

const makeTempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivaldi-original-skills-'));
  tempRoots.push(root);
  return root;
};

const writeSourceSkill = (sourceRoot, version, body = '# Project blueprint') => {
  const skillDir = path.join(sourceRoot, 'project-blueprint');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: project-blueprint\nauthor: Ivaldi\nivaldi_original: true\nivaldi_version: ${version}\n---\n\n${body}\n`,
  );
  fs.writeFileSync(path.join(skillDir, 'references', 'design-direction.md'), '# Design direction\n');
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ensureIvaldiOriginalSkills', () => {
  it('installs an original skill and its supporting files', () => {
    const root = makeTempRoot();
    const sourceRoot = path.join(root, 'source');
    const targetRoot = path.join(root, 'skills');
    writeSourceSkill(sourceRoot, 1);

    const result = ensureIvaldiOriginalSkills({ sourceRoot, skillDir: targetRoot });

    expect(result.installed).toEqual(['project-blueprint']);
    expect(fs.existsSync(path.join(targetRoot, 'project-blueprint', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetRoot, 'project-blueprint', 'references', 'design-direction.md'))).toBe(true);
  });

  it('updates only an older Ivaldi-managed copy', () => {
    const root = makeTempRoot();
    const sourceRoot = path.join(root, 'source');
    const targetRoot = path.join(root, 'skills');
    writeSourceSkill(sourceRoot, 2, '# New version');
    writeSourceSkill(targetRoot, 1, '# Old version');

    const result = ensureIvaldiOriginalSkills({ sourceRoot, skillDir: targetRoot });

    expect(result.updated).toEqual(['project-blueprint']);
    expect(fs.readFileSync(path.join(targetRoot, 'project-blueprint', 'SKILL.md'), 'utf8')).toContain('# New version');
  });

  it('does not overwrite a user-owned skill with the same name', () => {
    const root = makeTempRoot();
    const sourceRoot = path.join(root, 'source');
    const targetRoot = path.join(root, 'skills');
    writeSourceSkill(sourceRoot, 1);
    const targetDir = path.join(targetRoot, 'project-blueprint');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), '---\nname: project-blueprint\n---\n\n# User copy\n');

    const result = ensureIvaldiOriginalSkills({ sourceRoot, skillDir: targetRoot });

    expect(result.conflicts).toEqual(['project-blueprint']);
    expect(fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf8')).toContain('# User copy');
  });
});
