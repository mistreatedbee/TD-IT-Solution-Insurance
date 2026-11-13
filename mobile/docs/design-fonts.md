# Design-system fonts (mobile)

Source: design pack woff2 (OFL). Expo native cannot load woff2, so they were converted to TTF with fontTools (`TTFont.flavor = None`).

- Zilla Slab 400/500/600/700: `assets/fonts/ZillaSlab-<weight>.ttf`, one family name per weight (e.g. `ZillaSlab-600`).
- Plus Jakarta Sans: the pack ships a variable font (wght 200-800). React Native does not reliably select weights from a variable TTF on both platforms, so static instances were generated with `fontTools.varLib.instancer` at 400/500/600/700 and registered as separate families: `PlusJakartaSans-Regular|Medium|SemiBold|Bold`.
- Loaded via `useFonts` (expo-font) in `app/_layout.tsx` through `src/theme/designFonts.ts`; not awaited, so first render and splash handling are unchanged.
- Generated type styles (`designTypeStyles`) carry the exact `fontFamily` per weight; do not also set `fontWeight` on custom families on Android.
- Existing screens do not use these fonts yet.
