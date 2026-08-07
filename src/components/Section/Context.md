# Section

Layout wrapper for page sections. Handles the alternating white / warm-gray backgrounds and the standard vertical rhythm (80px mobile, 120px desktop), plus a centered max-width container.

## Usage

```tsx
import { Section } from 'components/Section'

<Section>
  <h2>Managed services</h2>
</Section>
<Section background="warm">
  <h2>Cloud migration</h2>
</Section>
```

Alternate `background` between `white` and `warm` down the page so adjacent sections read as separate blocks.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `background` | `'white' \| 'warm'` | `'white'` | Section background. `warm` uses the warm-gray surface. |
| `spacing` | `'default' \| 'compact' \| 'none'` | `'default'` | Vertical padding. `default` = 80px / 120px (lg), `compact` = 48px / 80px, `none` = 0. |
| `width` | `'narrow' \| 'default' \| 'wide' \| 'full'` | `'default'` | Max width of the inner container. |
| `bleed` | `boolean` | `false` | Skip the inner container so children span the full width (e.g. full-bleed media). |
| `as` | `'section' \| 'div' \| 'header' \| 'footer' \| 'main' \| 'article'` | `'section'` | Rendered element, for correct document semantics. |
| `className` | `string` | — | Extra classes on the outer element. |

All other `HTMLAttributes` (e.g. `id`, `aria-labelledby`) are forwarded to the root element.

## Notes

- Pair with a heading and `aria-labelledby` for accessible landmarks.
- Use `bleed` with `spacing="none"` for hero or full-width imagery.
