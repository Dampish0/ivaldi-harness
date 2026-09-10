import { create } from 'zustand';

import { dict as enDict, type I18nKey } from './messages/en';
import { DEFAULT_LOCALE, detectInitialLocale, type Locale, writeStoredLocale } from './runtime';

export type I18nParams = Record<string, string | number | boolean | null | undefined>;
export type I18nDictionary = Partial<Record<I18nKey, string>>;

type I18nState = {
  locale: Locale;
  dictionary: I18nDictionary;
  loadingLocale: Locale | null;
  setLocale: (locale: Locale) => void;
};

const dictionaries = new Map<Locale, I18nDictionary>([[DEFAULT_LOCALE, enDict]]);
const settingsDictionaries = new Map<Locale, I18nDictionary>();
const settingsDictionaryLoads = new Map<Locale, Promise<I18nDictionary>>();
let settingsCatalogActivated = false;

export function resetI18nDictionaryCacheForTests(): void {
  dictionaries.clear();
  dictionaries.set(DEFAULT_LOCALE, enDict);
  settingsDictionaries.clear();
  settingsDictionaryLoads.clear();
  settingsCatalogActivated = false;
}

async function loadDictionary(locale: Locale): Promise<I18nDictionary> {
  const cached = dictionaries.get(locale);
  if (cached) {
    return cached;
  }

  const mod = locale === 'zh-CN'
    ? await import('./messages/zh-CN') as { dict: I18nDictionary }
    : locale === 'fr'
      ? await import('./messages/fr') as { dict: I18nDictionary }
    : locale === 'zh-TW'
      ? await import('./messages/zh-TW') as { dict: I18nDictionary }
      : locale === 'es'
        ? await import('./messages/es') as { dict: I18nDictionary }
        : locale === 'pt-BR'
          ? await import('./messages/pt-BR') as { dict: I18nDictionary }
          : locale === 'uk'
            ? await import('./messages/uk') as { dict: I18nDictionary }
            : locale === 'ko'
              ? await import('./messages/ko') as { dict: I18nDictionary }
              : locale === 'pl'
                ? await import('./messages/pl') as { dict: I18nDictionary }
                : locale === 'de'
                  ? await import('./messages/de') as { dict: I18nDictionary }
                  : locale === 'ja'
                    ? await import('./messages/ja') as { dict: I18nDictionary }
                    : { dict: enDict };
  dictionaries.set(locale, mod.dict);
  return mod.dict;
}

async function loadSettingsDictionary(locale: Locale): Promise<I18nDictionary> {
  const cached = settingsDictionaries.get(locale);
  if (cached) {
    return cached;
  }

  const inFlight = settingsDictionaryLoads.get(locale);
  if (inFlight) {
    return inFlight;
  }

  const load = (async () => {
    const mod = locale === 'zh-CN'
      ? await import('./messages/zh-CN.settings')
      : locale === 'fr'
        ? await import('./messages/fr.settings')
        : locale === 'zh-TW'
          ? await import('./messages/zh-TW.settings')
          : locale === 'es'
            ? await import('./messages/es.settings')
            : locale === 'pt-BR'
              ? await import('./messages/pt-BR.settings')
              : locale === 'uk'
                ? await import('./messages/uk.settings')
                : locale === 'ko'
                  ? await import('./messages/ko.settings')
                  : locale === 'pl'
                    ? await import('./messages/pl.settings')
                    : locale === 'de'
                      ? await import('./messages/de.settings')
                      : locale === 'ja'
                        ? await import('./messages/ja.settings')
                        : await import('./messages/en.settings');
    const dictionary = mod.settingsDict as I18nDictionary;
    settingsDictionaries.set(locale, dictionary);
    return dictionary;
  })();

  settingsDictionaryLoads.set(locale, load);
  try {
    return await load;
  } finally {
    settingsDictionaryLoads.delete(locale);
  }
}

function getCachedActiveDictionary(locale: Locale): I18nDictionary | null {
  const core = dictionaries.get(locale);
  if (!core) {
    return null;
  }
  if (!settingsCatalogActivated) {
    return core;
  }
  const settings = settingsDictionaries.get(locale);
  return settings ? { ...core, ...settings } : null;
}

async function loadActiveDictionary(locale: Locale): Promise<I18nDictionary> {
  const core = await loadDictionary(locale);
  if (!settingsCatalogActivated) {
    return core;
  }
  const settings = await loadSettingsDictionary(locale);
  return { ...core, ...settings };
}

export const useI18nStore = create<I18nState>()((set, get) => ({
  locale: DEFAULT_LOCALE,
  dictionary: enDict,
  loadingLocale: null,
  setLocale: (locale) => {
    const current = get();
    const cached = getCachedActiveDictionary(locale);
    if (current.locale === locale && current.loadingLocale !== locale && cached) {
      return;
    }

    writeStoredLocale(locale);

    set({
      locale,
      dictionary: cached ?? current.dictionary,
      loadingLocale: cached ? null : locale,
    });

    if (cached) {
      return;
    }

    void loadActiveDictionary(locale).then((dictionary) => {
      if (get().locale !== locale) {
        return;
      }
      set({ dictionary, loadingLocale: null });
    }).catch((error) => {
      console.error(`[i18n] failed to load locale ${locale}`, error);
      if (get().locale === locale) {
        set({ dictionary: enDict, loadingLocale: null });
      }
    });
  },
}));

export async function ensureSettingsDictionary(locale = useI18nStore.getState().locale): Promise<void> {
  settingsCatalogActivated = true;
  const [core, settings] = await Promise.all([
    loadDictionary(locale),
    loadSettingsDictionary(locale),
  ]);
  if (useI18nStore.getState().locale !== locale) {
    return;
  }
  useI18nStore.setState({ dictionary: { ...core, ...settings } });
}

export function initializeLocale(): void {
  useI18nStore.getState().setLocale(detectInitialLocale());
}

export function formatMessage(dictionary: I18nDictionary, key: I18nKey, params?: I18nParams): string {
  const template: string = dictionary[key] ?? (enDict as I18nDictionary)[key] ?? key;
  if (!params) {
    return template;
  }

  return template.replace(/\{([^{}]+)\}/g, (match: string, rawKey: string) => {
    const value = params[rawKey.trim()];
    return value === null || value === undefined ? match : String(value);
  });
}

export type { I18nKey, Locale };
