# SectionHeading

Introduces a major page section with a consistent eyebrow label, title, and supporting subtitle. Use it at the top of every marketing or dashboard section so hierarchy and spacing stay uniform.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `eyebrow` | `string` | – | Small uppercase label above the title |
| `title` | `string` | required | Main section title |
| `subtitle` | `string` | – | Supporting copy below the title |
| `align` | `'left' \| 'center'` | `'left'` | Block alignment |
| `tone` | `'light' \| 'dark'` | `'light'` | Use `dark` on dark backgrounds |
| `size` | `'md' \| 'lg'` | `'md'` | Title scale |
| `as` | `'h1' \| 'h2' \| 'h3'` | `'h2'` | Heading level for document outline |
| `actions` | `ReactNode` | – | Trailing actions (left align only pushes them to the right on `sm+`) |
| `className` | `string` | – | Extra classes on the wrapper |

## Usage

```tsx
<SectionHeading
  eyebrow="Managed IT"
  title="Technology that keeps your business running"
  subtitle="Proactive monitoring and rapid support."
/>
```

Centered with an action:

```tsx
<SectionHeading
  align="center"
  size="lg"
  title="Our services"
  actions={<button type="button">View all</button>}
/>
```

## Guidance

- Keep only one `as="h1"` per page; default `h2` fits most sections.
- Keep subtitles to one or two lines — the block caps at `max-w-2xl` for readability.
- Pair `tone="dark"` with dark section backgrounds only.
