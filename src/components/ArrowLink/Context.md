# ArrowLink

Inline text link ("Learn more" style) with a trailing arrow that slides on hover. Use it for secondary, low-emphasis actions inside cards and at the end of content sections — not as a primary CTA (use a Button for that).

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Link label text. |
| `href` | `string` | — | Destination URL. Omitted when `disabled`. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Text and icon scale. |
| `tone` | `'default' \| 'muted' \| 'inverse'` | `'default'` | Color treatment; use `inverse` on dark surfaces. |
| `reverse` | `boolean` | `false` | Puts the arrow before the label, pointing left (back navigation). |
| `disabled` | `boolean` | `false` | Non-interactive, dimmed, removed from tab order. |

All other native `<a>` attributes (`target`, `rel`, `onClick`, `aria-*`, …) are forwarded.

## Usage

```tsx
import { ArrowLink } from 'components/ArrowLink'

<ArrowLink href="/services">Learn more</ArrowLink>

<ArrowLink href="/services" reverse size="sm" tone="muted">
  Back to overview
</ArrowLink>
```

## Notes

- Hover and keyboard focus both trigger the arrow slide and underline, so the affordance is not mouse-only.
- Motion is disabled automatically under `prefers-reduced-motion`.
- The arrow is `aria-hidden`; keep the label descriptive (avoid bare "Click here").
