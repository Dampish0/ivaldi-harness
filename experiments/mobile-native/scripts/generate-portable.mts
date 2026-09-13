import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// These files stay owned and tested by shared UI. Copying, rather than resolving
// outside this package, also lets Windows stage the native build at a short path.
const files = ['connectionPayload.ts', ...['protocol', 'crypto', 'handshake', 'tunnel-client', 'tunnel-codec', 'tunnel-payloads', 'transport-error'].map(name => `relay/${name}.ts`)];
const manifest: { source: string; sha256: string }[] = [];
for (const file of files) {
  const source = new URL(`../../../packages/ui/src/lib/${file}`, import.meta.url);
  const destination = new URL(`../src/generated/portable/${file}`, import.meta.url);
  await mkdir(new URL('.', destination), { recursive: true });
  await copyFile(source, destination);
  manifest.push({ source: `packages/ui/src/lib/${file}`, sha256: createHash('sha256').update(await readFile(source)).digest('hex') });
}
await writeFile(new URL('../src/generated/portable/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
