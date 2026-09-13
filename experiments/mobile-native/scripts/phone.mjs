import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);
const adb = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const command = (...args) => exec(adb, ['-s', serial, ...args], { maxBuffer: 20_000_000 });
const foreground = (await command('shell', 'dumpsys', 'activity', 'activities')).stdout;
if (!/(?:mResumedActivity|topResumedActivity).*dev\.ivaldi\.nativecomparison/.test(foreground)) throw new Error('Bring Ivaldi Native to the foreground before operating its UI');

async function nodes() {
  const dump = await command('shell', 'uiautomator', 'dump', '/sdcard/ivaldi-native-layout.xml');
  if (!dump.stdout.includes('/sdcard/ivaldi-native-layout.xml')) throw new Error('Android could not capture the current UI. Wait for the interaction to settle; the previous layout was not used.');
  const xml = (await command('shell', 'cat', '/sdcard/ivaldi-native-layout.xml')).stdout;
  const result = [];
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_entity, name) => name.startsWith('#') ? String.fromCodePoint(Number.parseInt(name.slice(name[1] === 'x' ? 2 : 1), name[1] === 'x' ? 16 : 10)) : entities[name]);
  for (const match of xml.matchAll(/<node\b((?:[^"'>]|"[^"]*"|'[^']*')*)>/g)) {
    const values = Object.fromEntries([...match[1].matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)].map(item => [item[1], decode(item[2] ?? item[3])]));
    const bounds = values.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!bounds || values.package !== 'dev.ivaldi.nativecomparison') continue;
    result.push({ id: values['resource-id'], text: values.text, label: values['content-desc'], focused: values.focused === 'true', clickable: values.clickable === 'true', bounds: bounds.slice(1).map(Number) });
  }
  return result;
}

const [action, value] = process.argv.slice(2);
if (action === 'inspect') {
  console.log(JSON.stringify((await nodes()).filter(node => node.id || node.clickable || node.focused), null, 2));
} else if (action === 'tap') {
  const visible = await nodes();
  const node = visible.find(item => item.id === value || item.label === value);
  if (!node) throw new Error(`Visible control not found: ${value}`);
  const [left, top, right, bottom] = node.bounds;
  if (right <= left || bottom <= top) throw new Error('Control has no visible bounds');
  let x = (left + right) / 2;
  let y = (top + bottom) / 2;
  if (value === 'drawer-backdrop') {
    const panel = visible.find(item => item.id === 'drawer');
    if (!panel) throw new Error('Drawer panel is unavailable');
    x = (panel.bounds[2] + right) / 2;
  }
  if (value === 'sheet-backdrop') {
    const panel = visible.find(item => item.id === 'sheet');
    if (!panel) throw new Error('Sheet panel is unavailable');
    y = (top + panel.bounds[1]) / 2;
  }
  const composer = visible.find(item => item.id === 'composer');
  if (node.id.startsWith('attachment-') && composer && x >= composer.bounds[0] && x < composer.bounds[2] && y >= composer.bounds[1] && y < composer.bounds[3]) throw new Error('Attachment is covered by the composer. Scroll it into view before tapping.');
  await command('shell', 'input', 'tap', `${Math.round(x)}`, `${Math.round(y)}`);
} else if (action === 'screen') {
  await mkdir('artifacts', { recursive: true });
  const { stdout } = await exec(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 20_000_000 });
  await writeFile(join('artifacts', value || 'screen.png'), stdout);
} else {
  throw new Error('Usage: node scripts/phone.mjs inspect | tap <testID or label> | screen <filename>');
}
