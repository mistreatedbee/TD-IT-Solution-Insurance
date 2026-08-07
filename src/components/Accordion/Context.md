# Accordion

FAQ-style disclosure list. Each item shows a question row with a rotating +/− indicator and reveals
its answer with a smooth height transition.

## Usage

```tsx
import { Accordion, AccordionItem } from 'components/Accordion'

<Accordion defaultOpen={['support']}>
  <AccordionItem value="support" title="What support hours do you offer?">
    7am–7pm on business days, with 24/7 on-call for priority incidents.
  </AccordionItem>
  <AccordionItem value="onboarding" title="How long does onboarding take?">
    Most environments are onboarded within two weeks.
  </AccordionItem>
</Accordion>
```

## Props

### `Accordion`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `allowMultiple` | `boolean` | `false` | Let more than one item stay open at a time. |
| `defaultOpen` | `string[]` | `[]` | Item `value`s expanded on first render. |
| `className` | `string` | `''` | Extra classes on the list wrapper. |
| `children` | `ReactNode` | — | `AccordionItem` elements. |

### `AccordionItem`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | — | Unique id used for open/close tracking. |
| `title` | `ReactNode` | — | Question / summary shown in the trigger row. |
| `children` | `ReactNode` | — | Answer content. |
| `disabled` | `boolean` | `false` | Prevents expanding the item. |

## Notes

- Open state is managed internally; `AccordionItem` must be rendered inside `Accordion`.
- Panel height is measured with a `ResizeObserver`, so dynamic content animates correctly.
- Triggers are real buttons with `aria-expanded` / `aria-controls`, and panels use `role="region"`.
