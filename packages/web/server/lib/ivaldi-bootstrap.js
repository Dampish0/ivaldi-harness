import { resolveIvaldiDataDirectory } from './ivaldi-data-dir.js';

// Run before modules capture their file paths. The legacy environment alias
// keeps existing domain modules and child processes on the same directory.
const directory = resolveIvaldiDataDirectory();
process.env.IVALDI_DATA_DIR = directory;
process.env.OPENCHAMBER_DATA_DIR = directory;
