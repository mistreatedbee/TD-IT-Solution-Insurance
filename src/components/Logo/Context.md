# Logo

Brand mark for TD IT Solution Insurance. **Updated 2026-08-07**: the real brand asset (`public/logo.png` — navy wordmark + orange "INSURANCE", supplied by the platform owner) is now used verbatim for `tone="navy"` (light-background contexts), rendered as an `<img>` at a fixed height per `size`. `variant` (`full`/`glyph`/`wordmark`) has no effect when `tone="navy"` — the real asset is one combined lockup, not separable into parts.

For `tone="light"` (dark/navy-background contexts, e.g. the site footer), no reversed/white version of the real mark exists yet, so this still falls back to the original placeholder: a minimal geometric shield/lock glyph (`LogoGlyph`) paired with a white typographic wordmark, where `variant` still applies normally. Follow-up flagged for `design-system-manager`: commission a proper light/reversed lockup of the real mark so the placeholder fallback isn't needed long-term.

## Usage

```tsx
import { Logo } from 'components/Logo'

<Logo href="/" size="md" />
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `'full' \| 'glyph' \| 'wordmark'` | `'full'` | Which parts of the mark to render. Use `glyph` for collapsed nav or favicons-in-UI, `wordmark` when a separate icon is already present. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Overall scale of glyph and type. |
| `tone` | `'navy' \| 'light'` | `'navy'` | `navy` for light backgrounds, `light` for navy/dark surfaces. |
| `href` | `string` | — | When provided, renders as an anchor with a focus ring. |
| `label` | `string` | `'TD IT Solution Insurance'` | Accessible label for the mark. |
| `className` | `string` | — | Extra classes on the lockup wrapper. |

Also exports `LogoGlyph` for cases where only the raw SVG shield/lock is needed.

## Examples

```tsx
{/* Header lockup */}
<Logo href="/" />

{/* Collapsed sidebar */}
<Logo variant="glyph" size="sm" />

{/* Footer on navy */}
<footer className="bg-[#0B2A4A] p-8">
  <Logo tone="light" size="lg" />
</footer>
```

## Notes

- Keep clear space around the lockup roughly equal to the glyph height.
- Do not recolor the wordmark outside the two provided tones.
