# StepItem

A single step in the 4-step "How It Works" timeline. Renders a large watermark numeral, an optional icon, a step label, title, description, and an animated dashed connector to the next step.

Render inside an `<ol>` — the component is an `<li>`.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `step` | `number` | — | Position in the timeline; shown as the watermark numeral and "Step N" label. |
| `title` | `string` | — | Short step title (renders as `h3`). |
| `description` | `string` | — | Supporting copy. |
| `icon` | `ReactNode` | — | Optional icon above the title (lucide-react, 20px). |
| `isLast` | `boolean` | `false` | Hides the connector — use on the final step. |
| `isActive` | `boolean` | `false` | Highlights the numeral and icon tile with the secondary color. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Connector direction. Horizontal connectors only render at `lg` and up. |
| `delay` | `number` | `0` | Stagger delay in seconds for the fade-up entrance. |
| `className` | `string` | `''` | Extra classes on the root `li`. |

## Usage

```tsx
<ol className="flex flex-col gap-12 lg:flex-row lg:gap-6">
  {steps.map((s, i) => (
    <StepItem
      key={s.step}
      step={s.step}
      title={s.title}
      description={s.description}
      icon={s.icon}
      isLast={i === steps.length - 1}
      delay={i * 0.1}
    />
  ))}
</ol>
```

## Notes

- Uses design system tokens: `text-primary`, `text-secondary`, `secondary`, `card`, `card-elevated`, `--radius-button`.
- Entrance and connector animation use framer-motion; the connector marquee loops continuously.
- Watermark numeral and connector are `aria-hidden`; the "Step N" label carries the ordinal for screen readers.
