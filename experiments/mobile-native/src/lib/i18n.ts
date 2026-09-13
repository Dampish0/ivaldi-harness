import { useSyncExternalStore } from 'react';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import catalogs from '../generated/catalogs.json';
import messages from '../generated/messages.json';
import { serializeWrite } from '../runtime/storage';

export type MessageKey = keyof typeof messages;
export const localeNames = { en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français', ja: '日本語', ko: '한국어', pl: 'Polski', 'pt-BR': 'Português', uk: 'Українська', 'zh-CN': '简体中文', 'zh-TW': '繁體中文' };
export type Locale = keyof typeof localeNames;
export const localeKeys = Object.keys(localeNames).filter((key): key is Locale => key in localeNames);
function supported(value: string): Locale { return localeKeys.find(key => key === value) ?? localeKeys.find(key => key === value.split('-')[0]) ?? 'en'; }
let locale = supported(getLocales()[0]?.languageTag ?? 'en');
let revision = 0;
const listeners = new Set<() => void>();
const initialRevision = revision;
void AsyncStorage.getItem('ivaldi.native.locale').then(saved => { if (saved && revision === initialRevision) { locale = supported(saved); listeners.forEach(listener => listener()); } }).catch(() => undefined);
export function useI18n() {
  const current = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => locale);
  return {
    locale: current,
    label: (language: Locale) => localeNames[language],
    setLocale: async (language: Locale) => { const next = ++revision; await serializeWrite(() => AsyncStorage.setItem('ivaldi.native.locale', language)); if (revision === next) { locale = language; listeners.forEach(listener => listener()); } },
    t: (key: MessageKey, values?: { [name: string]: string | number }) => {
      const translated = catalogs[current][key];
      return values ? translated.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match)) : translated;
    },
  };
}
