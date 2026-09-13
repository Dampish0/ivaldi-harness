import { createContext, useContext } from 'react';
import { Platform, type TextStyle } from 'react-native';
import dark from './generated/dark.json';
import { defaultAppearance, type AppearancePreferences } from './runtime/appearance';

type NativeTheme = {
  colors: typeof dark.colors;
  dark: boolean;
  storageError: boolean;
  appearance: AppearancePreferences;
  appearanceReady: boolean;
  setAppearance: (patch: Partial<AppearancePreferences>) => Promise<void>;
  toggle: () => Promise<void>;
};
export const ThemeContext = createContext<NativeTheme>({ colors: dark.colors, dark: true, storageError: false, appearance: defaultAppearance, appearanceReady: false, setAppearance: () => Promise.resolve(), toggle: () => Promise.resolve() });
export const useTheme = () => useContext(ThemeContext);
export const font = { regular: 'Selawik', semibold: 'SelawikSemibold' };
const systemFont = Platform.OS === 'ios' ? { regular: 'System', semibold: 'System' } : { regular: 'sans-serif', semibold: 'sans-serif-medium' };

/** App scaling is applied before React Native's normal OS accessibility scaling. */
export function useTypography() {
  const { appearance } = useTheme();
  const semiboldWeight: TextStyle['fontWeight'] = appearance.fontFamily === 'system' ? '600' : 'normal';
  return {
    font: appearance.fontFamily === 'system' ? systemFont : font,
    semiboldWeight,
    text: (size: number, lineHeight: number): TextStyle => ({ fontSize: size * appearance.textScale / 100, lineHeight: lineHeight * appearance.textScale / 100 }),
  };
}
