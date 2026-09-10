import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const directoryExists = (directory) => {
  try {
    if (!statSync(directory).isDirectory()) throw new Error('Application data path is not a directory');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

// Existing installs retain their data location. Renaming or copying managed
// worktrees would invalidate their absolute Git paths, so never move them here.
export const resolveIvaldiDataDirectory = ({ home = homedir(), environment = process.env } = {}) => {
  const override = environment.IVALDI_DATA_DIR?.trim() || environment.OPENCHAMBER_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  const current = path.join(home, '.config', 'ivaldi');
  if (directoryExists(current)) return current;
  const legacy = path.join(home, '.config', 'openchamber');
  return directoryExists(legacy) ? legacy : current;
};
