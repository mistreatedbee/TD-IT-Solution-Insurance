# AssetBadge

Mini icon + label card representing a covered asset type (vehicle, laptop, phone, tablet, TV, business equipment). Designed for the coverage overview grid, where several badges sit side by side to show what a customer's plan protects.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `'vehicle' \| 'laptop' \| 'phone' \| 'tablet' \| 'tv' \| 'business'` | — | Asset type; sets the default icon and label. |
| `label` | `string` | type default | Override the displayed label. |
| `description` | `string` | — | Optional secondary line (count, coverage note). |
| `selected` | `boolean` | `false` | Filled/active treatment with a check marker. |
| `disabled` | `boolean` | `false` | Dims the badge and blocks interaction. |
| `size` | `'sm' \| 'md'` | `'md'` | Visual density. |
| `onClick` | `() => void` | — | When provided, renders as a toggle button with `aria-pressed`. |
| `className` | `string` | `''` | Extra classes on the root element. |

## Usage

```tsx
import { AssetBadge } from 'components/AssetBadge'

<div className="grid grid-cols-3 gap-3">
  <AssetBadge type="vehicle" description="2 covered" selected />
  <AssetBadge type="laptop" description="1 covered" selected />
  <AssetBadge type="tv" description="Not covered" />
</div>
```

Toggleable:

```tsx
<AssetBadge type="phone" selected={isOn} onClick={() => setIsOn(!isOn)} />
```

## Notes

- Static badges render as a `div`; passing `onClick` upgrades them to an accessible button with focus ring and pressed state.
- Icons come from `lucide-react` and are hidden from screen readers; the text label carries meaning.
