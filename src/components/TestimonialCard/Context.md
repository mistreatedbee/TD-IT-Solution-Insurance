# TestimonialCard

A quote card for client testimonials. Shows an optional monochrome (grayscale, dimmed) client logo, an italic quote accented by an oversized light quotation mark, and an author row with avatar (or initials placeholder), title, and company.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `quote` | `string` | — | Testimonial text, rendered in italics. Required. |
| `authorName` | `string` | — | Author name. Required; also used for the initials fallback. |
| `authorTitle` | `string` | — | Author's job title. |
| `company` | `string` | — | Company name, shown after the title. |
| `avatarUrl` | `string` | — | Avatar image. Omit to show an initials placeholder. |
| `logoUrl` | `string` | — | Client logo, rendered grayscale at 60% opacity. |
| `logoAlt` | `string` | `"{company} logo"` | Alt text for the logo. |
| `className` | `string` | `''` | Extra classes on the card root. |

## Usage

```tsx
import { TestimonialCard } from 'components/TestimonialCard'

<TestimonialCard
  logoUrl="/logos/northwind.svg"
  quote="They migrated our infrastructure with zero downtime."
  authorName="Amara Osei"
  authorTitle="Director of IT"
  company="Northwind Freight"
  avatarUrl="/avatars/amara.jpg"
/>
```

## Notes

- Uses semantic `figure` / `blockquote` / `figcaption` markup; the decorative quote mark is `aria-hidden`.
- The card stretches to `h-full`, so cards in a grid row match heights.
- Exports `getInitials(name)` for reuse.
