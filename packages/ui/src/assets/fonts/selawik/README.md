# Selawik

Unmodified WOFF2 files from Microsoft's [Selawik 1.01 release](https://github.com/microsoft/Selawik/releases/tag/1.01), distributed under the [SIL Open Font License](../../../../../web/public/licenses/Selawik.txt).

`selawk.woff2` is regular 400, `selawksb.woff2` is semibold 600, and `selawkb.woff2` is bold 700. Together they add 43,952 bytes before packaging.

Microsoft describes Selawik as an open-source replacement for Segoe UI. It gives native mobile a closer match to the Windows desktop's default typography than Android's Roboto fallback. It is not identical to Segoe UI. `fontLoader.ts` loads these bundled assets without a CDN request. Existing saved font choices are preserved, and Appearance settings expose the choice on mobile.
