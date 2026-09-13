import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Expo resolves junctions and drive aliases to the long source path. A physical
// short copy avoids Ninja's object-file limit without modifying dependencies.
const source = fileURLToPath(new URL('../', import.meta.url));
const destination = join(homedir(), 'ivaldi-native-build');
const marker = join(destination, '.ivaldi-native-build');
await mkdir(destination, { recursive: true });
const entries = await readdir(destination);
if (entries.length && (!entries.includes('.ivaldi-native-build') || resolve((await readFile(marker, 'utf8')).trim()) !== resolve(source))) {
  throw new Error('The staging directory belongs to another task. Choose a separate build directory.');
}
await writeFile(marker, source);
for (const entry of ['package.json', 'package-lock.json', 'app.json', 'index.ts', 'tsconfig.json', 'src', 'assets', 'plugins']) {
  await cp(join(source, entry), join(destination, entry), { recursive: true });
}
console.log(destination);
