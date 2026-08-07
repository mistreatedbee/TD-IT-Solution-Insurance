# Avatar

Circular headshot placeholder with an electric-blue tint background. Used in testimonial author blocks and anywhere a person is represented.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | — | Image URL. Falls back to initials/glyph if missing or if loading fails. |
| `name` | `string` | — | Person's name; used for alt text and to derive up to two initials. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 32px, 48px, or 64px circle. |
| `className` | `string` | `''` | Extra classes for the root element. |

## Usage

```tsx
import { Avatar } from 'components/Avatar'

<Avatar name="Marcus Hale" />
<Avatar src="https://example.com/marcus.jpg" name="Marcus Hale" size="lg" />
```

## Notes

- Handles image load errors by reverting to initials, then to a generic person glyph.
- When no image is rendered, the root gets `role="img"` with an accessible label.
