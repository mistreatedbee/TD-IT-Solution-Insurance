# GlassCard

Semi-transparent, blurred glassmorphism card. Used for benefits grids and small floating "flair" elements layered over gradient, photographic, or dark backgrounds.

## When to use

- Benefit / feature tiles over a dark or gradient hero section
- Small floating stat or badge cards overlapping imagery
- Any surface that should read as translucent rather than solid

Needs a visually rich background behind it — on a flat solid surface the blur has nothing to work with.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `icon` | `ReactNode` | – | Visual rendered in a tinted square above the title |
| `title` | `ReactNode` | – | Card heading (renders as `h3`) |
| `description` | `ReactNode` | – | Supporting copy under the heading |
| `tone` | `'light' \| 'dark'` | `'light'` | `light` for dark/gradient backgrounds, `dark` for light ones |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Inner spacing |
| `interactive` | `boolean` | `false` | Hover lift, brighter surface, focus ring — for clickable cards |
| `children` | `ReactNode` | – | Custom body content, rendered below title/description |

Also accepts all standard `div` attributes (`className`, `onClick`, `role`, `tabIndex`, …).

## Usage

```tsx
import { ShieldCheckIcon } from 'lucide-react'
import { GlassCard } from 'components/GlassCard'

<GlassCard
  icon={<ShieldCheckIcon className="h-5 w-5" />}
  title="Enterprise-grade security"
  description="24/7 monitoring and compliance-ready reporting."
/>
```

Clickable tile:

```tsx
<GlassCard interactive role="button" tabIndex={0} onClick={onSelect} title="Managed IT" />
```

Custom content only:

```tsx
<GlassCard tone="dark" padding="sm">
  <p className="text-lg font-semibold">99.98%</p>
</GlassCard>
```

## Accessibility

- Title renders as an `h3` — keep the surrounding heading hierarchy consistent.
- The icon slot is `aria-hidden`; convey meaning through the title or description.
- When `interactive`, supply `role="button"` and `tabIndex={0}` (or wrap in a real link/button) so keyboard users get the focus ring.
