# Reveal

Scroll-triggered animation wrapper. Fades and slides its children into place when they enter the viewport, using the design system's calm motion timing (600ms, soft ease-out curve). Respects `prefers-reduced-motion` by rendering children statically.

## Usage

```tsx
import { Reveal } from 'components/Reveal'

<Reveal>
  <h2>Managed IT, quietly handled</h2>
</Reveal>
```

Stagger a group by increasing `delay`:

```tsx
{items.map((item, i) => (
  <Reveal key={item.id} delay={i * 0.12}>
    <ServiceCard {...item} />
  </Reveal>
))}
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Content to reveal. |
| `direction` | `'up' \| 'down' \| 'left' \| 'right' \| 'none'` | `'up'` | Direction the content travels from. |
| `distance` | `number` | `24` | Travel distance in pixels. |
| `delay` | `number` | `0` | Delay before animating, in seconds. |
| `duration` | `number` | `0.6` | Animation duration in seconds. |
| `repeat` | `boolean` | `false` | Replay each time the element re-enters view. |
| `amount` | `number` | `0.2` | Fraction of the element visible before triggering. |
| `as` | `keyof JSX.IntrinsicElements` | `'div'` | Underlying element to render. |
| `className` | `string` | — | Classes applied to the wrapper. |

All other props are forwarded to the underlying motion element.

## Notes

- Purely a layout-neutral wrapper — it adds no spacing or visual styling of its own.
- Keep delays under ~0.4s so content never feels slow to appear.
- Avoid nesting `Reveal` inside `Reveal`; stagger siblings instead.
