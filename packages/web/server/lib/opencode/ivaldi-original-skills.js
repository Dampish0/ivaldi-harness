import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_DIR, ensureDirs } from './shared.js';

const IVALDI_ORIGINAL_SKILLS_ROOT = fileURLToPath(
  new URL('../../ivaldi-original-skills/', import.meta.url),
);

const IVALDI_ORIGINAL_SKILLS = [
  { name: 'project-blueprint' },
];

// Electron's fs.cpSync cannot traverse directories inside a packaged ASAR.
// Read the bundled skill files through its ASAR-aware filesystem instead.
const copySkillDirectory = (sourceDir, targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) copySkillDirectory(source, target);
    else fs.writeFileSync(target, fs.readFileSync(source));
  }
};

const readManagedMetadata = (skillMdPath) => {
  if (!fs.existsSync(skillMdPath)) {
    return { managed: false, version: 0 };
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const managed = /^ivaldi_original:\s*true\s*$/m.test(content);
  const versionMatch = content.match(/^ivaldi_version:\s*(\d+)\s*$/m);
  const version = versionMatch ? Number.parseInt(versionMatch[1], 10) : 0;
  return {
    managed,
    version: Number.isFinite(version) ? version : 0,
  };
};

export const ensureIvaldiOriginalSkills = ({
  sourceRoot = IVALDI_ORIGINAL_SKILLS_ROOT,
  skillDir = SKILL_DIR,
} = {}) => {
  if (skillDir === SKILL_DIR) {
    ensureDirs();
  } else {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const result = {
    installed: [],
    updated: [],
    unchanged: [],
    conflicts: [],
  };

  for (const skill of IVALDI_ORIGINAL_SKILLS) {
    const sourceDir = path.join(sourceRoot, skill.name);
    const sourceMdPath = path.join(sourceDir, 'SKILL.md');
    const targetDir = path.join(skillDir, skill.name);
    const targetMdPath = path.join(targetDir, 'SKILL.md');

    if (!fs.existsSync(sourceMdPath)) {
      throw new Error(`Ivaldi original skill source is missing: ${sourceMdPath}`);
    }

    const sourceMetadata = readManagedMetadata(sourceMdPath);
    if (!sourceMetadata.managed || sourceMetadata.version < 1) {
      throw new Error(`Ivaldi original skill metadata is invalid: ${sourceMdPath}`);
    }

    if (!fs.existsSync(targetMdPath)) {
      copySkillDirectory(sourceDir, targetDir);
      result.installed.push(skill.name);
      continue;
    }

    const targetMetadata = readManagedMetadata(targetMdPath);
    if (!targetMetadata.managed) {
      result.conflicts.push(skill.name);
      continue;
    }

    if (targetMetadata.version >= sourceMetadata.version) {
      result.unchanged.push(skill.name);
      continue;
    }

    copySkillDirectory(sourceDir, targetDir);
    result.updated.push(skill.name);
  }

  return result;
};
