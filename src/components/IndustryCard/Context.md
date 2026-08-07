# IndustryCard

Card representing an industry vertical served. Shows a colored top accent bar, an icon, a title, and a short description. Used in grids on marketing and solutions pages.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | — | Industry name shown as the card title. |
| `description` | `string` | — | Short supporting copy. |
| `icon` | `LucideIcon` | `BuildingIcon` | Icon rendered above the title. |
| `accent` | `'blue' \| 'green' \| 'amber' \| 'purple' \| 'red' \| 'slate'` | `'blue'` | Accent bar and icon color. |
| `onClick` | `() => void` | — | When provided, the card renders as a button with hover/focus states. |
| `className` | `string` | `''` | Extra classes for the card root. |

## Usage

```tsx
import { HeartPulseIcon } from 'lucide-react'
import { IndustryCard } from 'components/IndustryCard'

<IndustryCard
  title="Healthcare"
  description="HIPAA-compliant IT support and 24/7 monitoring."
  icon={HeartPulseIcon}
  accent="blue"
/>
```

Grid layout:

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {industries.map((i) => (
    <IndustryCard key={i.title} {...i} onClick={() => select(i)} />
  ))}
</div>
```

## Notes

- Titles render as `h3`; place inside a section with an `h2` heading.
- The accent bar and icon are decorative and hidden from assistive tech.
