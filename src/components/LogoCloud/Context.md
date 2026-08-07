# LogoCloud

A full-width trust strip that scrolls a continuous, seamless marquee of monochrome partner or client logos. Logos render as muted placeholder wordmarks by default and colorize on hover; passing `src` renders real images (grayscale until hovered).

## Usage

```tsx
import { LogoCloud } from 'components/LogoCloud'

<LogoCloud title="Trusted by teams worldwide" />

<LogoCloud
  speed={40}
  direction="right"
  logos={[
    { name: 'Lumen' },
    { name: 'Beacon', src: 'https://example.com/beacon.svg' },
  ]}
/>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | – | Optional uppercase eyebrow above the marquee. Also used as the section's accessible label. |
| `logos` | `LogoCloudItem[]` | `DEFAULT_LOGOS` | Logos to display. Each item is `{ name, src? }`. Empty arrays fall back to the defaults. |
| `speed` | `number` | `60` | Scroll speed in pixels per second. |
| `direction` | `'left' \| 'right'` | `'left'` | Marquee direction. |
| `pauseOnHover` | `boolean` | `true` | Pauses scrolling while the pointer is over the strip. |
| `fadeEdges` | `boolean` | `true` | Masks the left/right edges so logos fade out instead of clipping. |
| `className` | `string` | `''` | Extra classes on the wrapping `<section>` (e.g. background or vertical padding overrides). |

## Notes

- The logo list is duplicated once and animated with `framer-motion`'s `useAnimationFrame` for a seamless, jitter-free loop; the duplicate copy is `aria-hidden`.
- Rendered as a labelled `<section>` with a `<ul>`/`<li>` list, so the logos are announced once by screen readers.
- Best used between hero and feature sections, on a white or very light surface.
