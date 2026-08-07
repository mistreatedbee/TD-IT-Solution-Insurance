# Button

Core call-to-action primitive for TD IT Solutions. Four variants cover the full hierarchy of actions across light, dark, and gradient surfaces.

## Variants

- `primary` — electric-blue gradient pill with a subtle hover scale. One per view; the main CTA.
- `secondary` — outlined navy, rounded rectangle. Inverts to solid navy on hover.
- `ghost` — white-on-navy reversed treatment. Use only on dark or gradient sections.
- `tertiary` — text-only link button with underline on hover. Lowest emphasis.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'tertiary'` | `'primary'` | Visual emphasis level. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Padding and text scale. |
| `fullWidth` | `boolean` | `false` | Stretches the button to its container width. |
| `loading` | `boolean` | `false` | Shows a spinner, disables interaction, sets `aria-busy`. |
| `leadingIcon` | `ReactNode` | — | Icon rendered before the label (replaced by the spinner while loading). |
| `trailingIcon` | `ReactNode` | — | Icon rendered after the label. |
| `disabled` | `boolean` | `false` | Non-interactive state. |
| `className` | `string` | — | Extra classes appended last. |

All other native `<button>` attributes (`onClick`, `type`, `aria-*`, …) are forwarded.

## Usage

```tsx
import { ArrowRightIcon } from 'lucide-react'
import { Button } from 'components/Button'

<Button size="lg" trailingIcon={<ArrowRightIcon className="h-4 w-4" />}>
  Book a consult
</Button>

<Button variant="secondary" onClick={openServices}>Our services</Button>

<section className="bg-slate-900">
  <Button variant="ghost">Talk to us</Button>
</section>

<Button variant="tertiary">Learn more</Button>
```

## Guidelines

- Pair one `primary` with at most one `secondary` or `tertiary` action in the same group.
- Use `ghost` exclusively on dark backgrounds — it has no contrast on white.
- Keep labels short and action-led ("Request a quote", not "Click here").
- Icons are decorative; the label always carries the meaning. For icon-only actions, pass an `aria-label`.
