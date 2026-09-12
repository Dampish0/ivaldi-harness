import { CODE_FONT_OPTION_MAP, UI_FONT_OPTION_MAP, type FontFaceSource, type MonoFontOption, type UiFontOption } from '@/lib/fontOptions';
import selawikRegular from '@/assets/fonts/selawik/selawk.woff2?url';
import selawikSemibold from '@/assets/fonts/selawik/selawksb.woff2?url';
import selawikBold from '@/assets/fonts/selawik/selawkb.woff2?url';

const loadedFaces = new Set<string>();
const pendingFaces = new Map<string, Promise<void>>();

const buildFontUrl = (source: FontFaceSource, weight: number) => {
  const packageName = encodeURIComponent(source.packageName).replace('%40', '@').replace('%2F', '/');
  return `https://cdn.jsdelivr.net/npm/${packageName}/files/${source.filePrefix}-latin-${weight}-normal.woff2`;
};

const loadFace = (family: string, weight: number, url: string) => {
  const key = `${family}:${weight}`;
  if (loadedFaces.has(key)) {
    return Promise.resolve();
  }

  const pending = pendingFaces.get(key);
  if (pending) {
    return pending;
  }

  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    return Promise.resolve();
  }

  const face = new FontFace(family, `url(${url}) format('woff2')`, {
    style: 'normal',
    weight: String(weight),
    display: 'swap',
  });

  document.fonts.add(face);
  const promise = face.load()
    .then(() => {
      loadedFaces.add(key);
    })
    .catch((error) => {
      document.fonts.delete(face);
      console.warn(`Failed to load font: ${family} ${weight}`, error);
    })
    .finally(() => {
      pendingFaces.delete(key);
    });

  pendingFaces.set(key, promise);
  return promise;
};

const loadSource = (source: FontFaceSource | undefined) => {
  if (!source) {
    return Promise.resolve();
  }

  return Promise.all(source.weights.map((weight) => loadFace(source.family, weight, buildFontUrl(source, weight)))).then(() => undefined);
};

export const loadUiFont = (font: UiFontOption) => font === 'selawik'
  ? Promise.all([
    loadFace('Selawik', 400, selawikRegular),
    loadFace('Selawik', 600, selawikSemibold),
    loadFace('Selawik', 700, selawikBold),
  ]).then(() => undefined)
  : loadSource(UI_FONT_OPTION_MAP[font]?.source);

export const loadMonoFont = (font: MonoFontOption) => loadSource(CODE_FONT_OPTION_MAP[font]?.source);
