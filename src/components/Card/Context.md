# Card

Premium white surface used as the base container for services, benefits, and general content blocks. Rounded 16px corners, soft layered shadow, and — when interactive — a hover lift plus a warm gold accent edge that wipes in from the left.

_Appearance updated as part of the 2026-08-07 design token refresh (typeface pairing + navy/gold color system, layered shadow tokens); no prop API changes._

## Usage

```tsx
import { Card, CardHeader, CardBody, CardFooter } from 'components/Card'

<Card as="article">
  <CardHeader icon={<ShieldCheckIcon className="h-5 w-5" />} title="Cybersecurity" description="Endpoint protection." />
  <CardBody>Continuous scanning with a 15-minute response SLA.</CardBody>
  <CardFooter>
    <a href="/services">Learn more</a>
  </CardFooter>
</Card>
```

## Props

### Card
| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | – | Card contents |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Inner padding scale |
| `interactive` | `boolean` | `true` | Enables hover lift and gold accent edge |
| `as` | `'div' \| 'article' \| 'section' \| 'li'` | `'div'` | Semantic element to render |
| `className` | `string` | `''` | Extra classes (e.g. width constraints) |

All other `div` props are forwarded. Passing `onClick` automatically makes the card focusable (`role="button"`, `tabIndex=0`) with a visible focus ring.

### CardHeader
`title` (string, required), `description` (string), `icon` (ReactNode, rendered in a warm gold tinted tile), `className`.

### CardBody / CardFooter
`children`, `className`. `CardFooter` adds a top divider and horizontal action row.

## Guidance
- Use `interactive={false}` for static stat or info blocks that aren't links.
- Set width via `className` (e.g. `max-w-sm`) or let a grid parent control it.
- Keep card headings at `h3` level inside sections with an `h2`.
