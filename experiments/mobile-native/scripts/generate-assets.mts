import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { iconSpriteData } from '../../../packages/ui/src/components/icon/sprite';
import { dict } from '../../../packages/ui/src/lib/i18n/messages/en';
import { dict as de } from '../../../packages/ui/src/lib/i18n/messages/de';
import { dict as es } from '../../../packages/ui/src/lib/i18n/messages/es';
import { dict as fr } from '../../../packages/ui/src/lib/i18n/messages/fr';
import { dict as ja } from '../../../packages/ui/src/lib/i18n/messages/ja';
import { dict as ko } from '../../../packages/ui/src/lib/i18n/messages/ko';
import { dict as pl } from '../../../packages/ui/src/lib/i18n/messages/pl';
import { dict as ptBR } from '../../../packages/ui/src/lib/i18n/messages/pt-BR';
import { dict as uk } from '../../../packages/ui/src/lib/i18n/messages/uk';
import { dict as zhCN } from '../../../packages/ui/src/lib/i18n/messages/zh-CN';
import { dict as zhTW } from '../../../packages/ui/src/lib/i18n/messages/zh-TW';
import { settingsDict as enSettings } from '../../../packages/ui/src/lib/i18n/messages/en.settings';
import { settingsDict as deSettings } from '../../../packages/ui/src/lib/i18n/messages/de.settings';
import { settingsDict as esSettings } from '../../../packages/ui/src/lib/i18n/messages/es.settings';
import { settingsDict as frSettings } from '../../../packages/ui/src/lib/i18n/messages/fr.settings';
import { settingsDict as jaSettings } from '../../../packages/ui/src/lib/i18n/messages/ja.settings';
import { settingsDict as koSettings } from '../../../packages/ui/src/lib/i18n/messages/ko.settings';
import { settingsDict as plSettings } from '../../../packages/ui/src/lib/i18n/messages/pl.settings';
import { settingsDict as ptBRSettings } from '../../../packages/ui/src/lib/i18n/messages/pt-BR.settings';
import { settingsDict as ukSettings } from '../../../packages/ui/src/lib/i18n/messages/uk.settings';
import { settingsDict as zhCNSettings } from '../../../packages/ui/src/lib/i18n/messages/zh-CN.settings';
import { settingsDict as zhTWSettings } from '../../../packages/ui/src/lib/i18n/messages/zh-TW.settings';

function withSettings<T>(messages: T, settings: { [Key in keyof typeof enSettings]: string }) {
  return { ...messages, ...settings };
}

const output = new URL('../src/generated/', import.meta.url);
await mkdir(output, { recursive: true });
const names = ['menu-2', 'edit-box', 'search', 'close', 'add', 'arrow-up', 'arrow-down', 'arrow-down-s', 'arrow-left', 'arrow-right-s', 'check', 'folder-3', 'folder-open', 'file-text', 'file-copy', 'file-image', 'subtract', 'stop', 'more', 'settings-3', 'star', 'star-fill', 'attachment-2', 'chat-3', 'camera', 'computer', 'delete-bin', 'shield', 'archive', 'palette', 'text', 'global', 'restart', 'information', 'equalizer-2', 'robot'] as const satisfies readonly (keyof typeof iconSpriteData)[];
const icons = Object.fromEntries(names.map(name => {
  const body = iconSpriteData[name];
  if (!body) throw new Error(`Missing shared icon: ${name}`);
  return [name, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`];
}));
await writeFile(new URL('icons.json', output), JSON.stringify(icons, null, 2) + '\n');
const catalogs = { en: withSettings(dict, enSettings), de: withSettings(de, deSettings), es: withSettings(es, esSettings), fr: withSettings(fr, frSettings), ja: withSettings(ja, jaSettings), ko: withSettings(ko, koSettings), pl: withSettings(pl, plSettings), 'pt-BR': withSettings(ptBR, ptBRSettings), uk: withSettings(uk, ukSettings), 'zh-CN': withSettings(zhCN, zhCNSettings), 'zh-TW': withSettings(zhTW, zhTWSettings) };
for (const [locale, catalog] of Object.entries(catalogs)) {
  const messages = new Map(Object.entries(catalog));
  const missing = Object.keys(catalogs.en).filter(key => !messages.has(key));
  if (missing.length) throw new Error(`Incomplete native catalog ${locale}: ${missing.join(', ')}`);
}
await writeFile(new URL('messages.json', output), JSON.stringify(catalogs.en, null, 2) + '\n');
await writeFile(new URL('catalogs.json', output), JSON.stringify(catalogs) + '\n');
for (const variant of ['dark', 'light']) {
  await copyFile(new URL(`../../../packages/ui/src/lib/theme/themes/openchamber-${variant}.json`, import.meta.url), new URL(`${variant}.json`, output));
}
console.log(`Updated native copies of Ivaldi icons, labels and themes in ${fileURLToPath(output)}`);
