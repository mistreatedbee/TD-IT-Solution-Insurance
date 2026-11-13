# TD IT Solution Insurance design system (web)

Source: the design pack supplied by the designer (tokens.json, tokens.css, fonts/). Copied here unmodified
as the single source of truth; the mobile app consumes the same pack.

- `tokens.json` is authoritative. `tokens.css` is generated from it by the designer's tooling
  (re-import a new pack by replacing both files and `public/fonts/*.woff2`).
- Do not edit token values here.
- Themes: `data-theme="day"` (default) or `"night"` on `<html>`. `src/lib/td-theme.ts` has `setTdTheme()`.
- The app does not import `tokens.css` directly: existing app CSS already defines `--success`, `--glass-border`,
  `--blur-glass` etc. So `node design-system/build-web-css.mjs` (`npm run tokens:build`) writes
  `src/styles/td-tokens.css` with every variable namespaced `--td-*` and font urls pointing at `/fonts/`.
- Tailwind (`tailwind.config.js`, `theme.extend`): `bg-td-page`, `text-td-ink`, `rounded-td-lg`, `shadow-td-glass`,
  `p-td-4`, `backdrop-blur-td-glass`, `font-td-display`, `font-td-sans`. Type classes `.display-*`, `.title`, `.body*`, `.label*`
  come from the generated CSS.
- Checks: `npm run tokens:check` (css/json parity and generated file freshness);
  `node design-system/check-contrast.mjs` (writes nothing; see `CONTRAST.md`).
- Fonts: Zilla Slab + Plus Jakarta Sans woff2 in `public/fonts/`, `font-display: swap`, no CDN. Not applied globally yet.
