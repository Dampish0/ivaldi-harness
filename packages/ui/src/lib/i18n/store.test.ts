import { beforeEach, describe, expect, test } from 'bun:test';
import { DEFAULT_LOCALE, type Locale } from './runtime';
import { formatMessage, resetI18nDictionaryCacheForTests, setWorkWording, useI18nStore } from './store';

const defaultDictionary = useI18nStore.getState().dictionary;

const resetStore = () => {
  resetI18nDictionaryCacheForTests();
  useI18nStore.setState({
    locale: DEFAULT_LOCALE,
    dictionary: defaultDictionary,
    loadingLocale: null,
  });
};

const waitForLocaleLoadToSettle = async (locale: Locale) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (useI18nStore.getState().loadingLocale !== locale) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${locale} dictionary load`);
};

describe('i18n store', () => {
  beforeEach(resetStore);

  test('retries loading the active locale when it is not cached', async () => {
    useI18nStore.setState({
      locale: 'es',
      dictionary: defaultDictionary,
      loadingLocale: null,
    });

    try {
      useI18nStore.getState().setLocale('es');

      expect(useI18nStore.getState().loadingLocale).toBe('es');
      await waitForLocaleLoadToSettle('es');
    } finally {
      resetStore();
    }
  });

  test('loads the french dictionary', async () => {
    try {
      useI18nStore.getState().setLocale('fr');

      expect(useI18nStore.getState().loadingLocale).toBe('fr');
      await waitForLocaleLoadToSettle('fr');
      expect(useI18nStore.getState().dictionary['common.language.french']).toBe('Français');
    } finally {
      resetStore();
    }
  });

  test('Work mode swaps in everyday English wording and switches back', () => {
    const label = () => formatMessage(useI18nStore.getState().dictionary, 'sessions.sidebar.header.actions.newSession');
    try {
      expect(label()).toBe('New session');
      setWorkWording(true);
      expect(label()).toBe('New chat');
      setWorkWording(false);
      expect(label()).toBe('New session');
    } finally {
      resetStore();
    }
  });

  test('Work mode keeps the usual text in languages without Work wording', async () => {
    try {
      setWorkWording(true);
      useI18nStore.getState().setLocale('fr');
      await waitForLocaleLoadToSettle('fr');
      expect(useI18nStore.getState().dictionary['sessions.sidebar.header.actions.newSession'])
        .not.toBe('New chat');
    } finally {
      resetStore();
    }
  });
});
