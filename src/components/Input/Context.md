# Input

Base form field for the contact / quote forms. Renders a labelled single-line input (text, email, tel, url, password) or a textarea, with an electric-blue focus ring and a red error state.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `label` | `string` | — | Required visible label, wired to the field via `htmlFor`. |
| `type` | `'text' \| 'email' \| 'tel' \| 'url' \| 'password' \| 'textarea'` | `'text'` | Field type; `textarea` renders a multi-line field. |
| `hint` | `string` | — | Helper text below the field (hidden when `error` is set). |
| `error` | `string` | — | Error message; switches the field to its error state and sets `aria-invalid`. |
| `hideLabel` | `boolean` | `false` | Visually hides the label but keeps it for screen readers. |
| `rows` | `number` | `4` | Row count for the textarea variant. |
| `className` | `string` | `''` | Extra classes on the outer wrapper. |

All other native input/textarea attributes (`placeholder`, `value`, `onChange`, `required`, `disabled`, `name`, …) are forwarded. `ref` is forwarded to the underlying element.

## Usage

```tsx
import { Input } from 'components/Input'

<Input label="Full name" placeholder="Jane Doe" required />

<Input
  label="Work email"
  type="email"
  error="Enter a valid email address."
/>

<Input label="How can we help?" type="textarea" rows={5} />
```

## Notes

- Focus uses a navy (`primary`) border with a soft warm gold (`accent-gold-deep`) ring; error states use red-500 / red-600.
- Appearance updated as part of the 2026-08-07 design token refresh (typeface pairing + navy/gold color system); no prop API changes.
- Messages are linked with `aria-describedby`, so both hints and errors are announced.
