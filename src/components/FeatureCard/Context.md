# FeatureCard

Icon-led card used to describe services and product benefits. Composed of a duotone icon tile, a title, a thin warm-gold rule, and gray supporting copy.

_Appearance updated as part of the 2026-08-07 design token refresh (typeface pairing + navy/gold color system); no prop API changes._

## When to use

- Service/benefit grids on marketing or solution pages
- Three- or four-up feature rows (`grid gap-6 md:grid-cols-3`)

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `icon` | `ComponentType<{ className?: string; strokeWidth?: number \| string }>` | — | Icon component (e.g. from `lucide-react`), rendered inside the duotone tile. |
| `title` | `string` | — | Card heading (`h3`). |
| `description` | `ReactNode` | — | Supporting copy below the accent rule. |
| `footer` | `ReactNode` | — | Optional footer, e.g. a CTA link or tag row. |
| `align` | `'left' \| 'center'` | `'left'` | Content alignment. |
| `href` | `string` | — | Renders the card as an anchor with hover/focus treatment. |
| `className` | `string` | — | Extra classes merged onto the card root. |

## Behavior

- Non-interactive cards render as `<article>`; passing `href` renders an `<a>` with a visible focus ring.
- On hover of a linked card, the icon tile fills with the deep brand gold and the accent rule extends.

## Usage

```tsx
import { ShieldCheckIcon } from 'lucide-react'
import { FeatureCard } from 'components/FeatureCard'

<div className="grid gap-6 md:grid-cols-3">
  <FeatureCard
    icon={ShieldCheckIcon}
    title="Managed Cybersecurity"
    description="Continuous monitoring, endpoint protection, and incident response."
  />
</div>
```
