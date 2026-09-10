import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.log('[computer-use] skipped: Windows-only helper');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(root, 'native', 'computer-use', 'Ivaldi.ComputerUse.csproj');
const output = path.join(root, 'native', 'computer-use', 'publish');
fs.mkdirSync(output, { recursive: true });
const result = spawnSync('dotnet', [
  'publish', project,
  '--configuration', 'Release',
  '--runtime', 'win-x64',
  '--self-contained', 'true',
  '--output', output,
  '-p:PublishSingleFile=true',
  '-p:IncludeNativeLibrariesForSelfExtract=true',
  '-p:DebugType=None',
], { stdio: 'inherit', windowsHide: true });

if (result.status !== 0) process.exit(result.status || 1);
console.log(`[computer-use] helper published to ${output}`);
