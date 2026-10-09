import { describe, expect, test } from 'bun:test';

import { dict as enDict } from './messages/en';
import { settingsDict as enSettingsDict } from './messages/en.settings';
import { workDict as enWorkDict } from './messages/en.work';
import { dict as esDict } from './messages/es';
import { dict as deDict } from './messages/de';
import { dict as frDict } from './messages/fr';
import { dict as jaDict } from './messages/ja';
import { dict as koDict } from './messages/ko';
import { dict as plDict } from './messages/pl';
import { dict as ptBrDict } from './messages/pt-BR';
import { dict as ukDict } from './messages/uk';
import { dict as zhCnDict } from './messages/zh-CN';
import { dict as zhTwDict } from './messages/zh-TW';

const localeDictionaries = {
  en: enDict,
  de: deDict,
  fr: frDict,
  es: esDict,
  ja: jaDict,
  'pt-BR': ptBrDict,
  uk: ukDict,
  ko: koDict,
  pl: plDict,
  'zh-CN': zhCnDict,
  'zh-TW': zhTwDict,
} as const;

describe('i18n dictionaries', () => {
  // Only English and Swedish are maintained, so other languages may lack
  // newer keys and show English for them. They must not keep keys English
  // no longer has.
  test('no locale keeps keys english no longer has', () => {
    const englishKeys = new Set(Object.keys(enDict));

    for (const dictionary of Object.values(localeDictionaries)) {
      expect(Object.keys(dictionary).filter((key) => !englishKeys.has(key))).toEqual([]);
    }
  });

  test('Work wording changes the text and keeps its placeholders', () => {
    const english = new Map<string, string>(Object.entries({ ...enDict, ...enSettingsDict }));
    const placeholders = (text: string) => [...text.matchAll(/{([^{}]+)}/g)].map((match) => match[1]).sort();

    for (const [key, work] of Object.entries(enWorkDict)) {
      const usual = english.get(key) ?? '';
      expect(usual).not.toBe('');
      expect(work).not.toBe(usual);
      expect({ key, placeholders: placeholders(work) }).toEqual({ key, placeholders: placeholders(usual) });
    }
  });

  test('all locales expose language label keys', () => {
    for (const [, dictionary] of Object.entries(localeDictionaries)) {
      expect(dictionary['common.language.german']).toBeTruthy();
      expect(dictionary['common.language.french']).toBeTruthy();
      expect(dictionary['common.language.japanese']).toBeTruthy();
    }
  });
});
