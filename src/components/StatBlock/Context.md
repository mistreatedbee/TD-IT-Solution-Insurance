# StatBlock

Displays a headline metric: a large bold navy numeral, an electric-blue accent underline, and an uppercase label. The numeral counts up (ease-out) the first time the block scrolls into view; the underline draws in alongside it. Respects `prefers-reduced-motion`.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `number` | — | Target value to count up to. |
| `label` | `string` | — | Uppercase label under the numeral. |
| `prefix` | `string` | — | Text before the numeral (e.g. `"$"`). |
| `suffix` | `string` | — | Text after the numeral (e.g. `"%"`, `"+"`). |
| `decimals` | `number` | `0` | Decimal places displayed. |
| `duration` | `number` | `1600` | Count-up duration in ms. |
| `animate` | `boolean` | `true` | Set `false` to render the final value immediately. |
| `align` | `'left' \| 'center'` | `'left'` | Alignment of numeral, underline, and label. |
| `size` | `'md' \| 'lg'` | `'lg'` | Numeral scale and underline width. |
| `className` | `string` | — | Extra classes on the root element. |

## Usage

```tsx
import { StatBlock } from 'components/StatBlock'

<div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
  <StatBlock size="md" value={99.9} decimals={1} suffix="%" label="Uptime" />
  <StatBlock size="md" value={15} suffix=" min" label="Response time" />
  <StatBlock size="md" value={340} suffix="+" label="Clients served" />
</div>
```

## Notes

- Uses `framer-motion`'s `useInView` (triggers once at 40% visibility) plus a `requestAnimationFrame` count-up.
- The animated numeral is `aria-hidden`; an accessible label exposes the final formatted value to screen readers.
- Numerals use `tabular-nums` so the layout doesn't jitter while counting.
