# Logo

Brand mark for TD IT Solution Insurance: a minimal geometric shield/lock glyph paired with a navy typographic wordmark. This is a **placeholder** — no final brand art was supplied, so the glyph and type are designed to be swapped for the real asset without changing the component API.

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
