# Badge

Small pill label used for tags such as asset categories, statuses, and plan highlights.

## Usage

```tsx
import { Badge } from 'components/Badge'

<Badge>Hardware</Badge>
<Badge tone="gold">Premium Plan</Badge>
<Badge tone="emerald">Active</Badge>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `tone` | `'neutral' \| 'gold' \| 'emerald'` | `'neutral'` | Color treatment. Neutral for categories, gold for plan/accent highlights, emerald for success states. |
| `size` | `'sm' \| 'md'` | `'sm'` | Pill size and padding. |
| `icon` | `ReactNode` | – | Optional leading icon or dot (rendered `aria-hidden`). |
| `children` | `ReactNode` | – | Badge label. |
| `className` | `string` | – | Extra classes appended to the root. |

Also accepts any standard `<span>` attributes.

## Notes

- Renders a non-interactive `<span>`; do not use for actions — use a Button instead.
- Color alone should not convey meaning; keep the label descriptive (e.g. "Active", not just a green dot).
