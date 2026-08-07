# Carousel

Horizontally scrollable, snapping container with drag/swipe support. Built on `embla-carousel-react`. Use it for testimonials, industry cards, or client logo strips where horizontal space is constrained.

## Props — `Carousel`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `options` | `EmblaOptionsType` | `{ align: 'start', containScroll: 'trimSnaps' }` | Embla options (`loop`, `dragFree`, `align`, …). Merged over the defaults. |
| `showArrows` | `boolean` | `true` | Show previous/next arrow buttons. |
| `showDots` | `boolean` | `true` | Show dot pagination (hidden when there is only one snap). |
| `setApi` | `(api: CarouselApi) => void` | — | Receives the Embla API for external control (autoplay, programmatic scroll). |
| `label` | `string` | `'Carousel'` | Accessible label for the carousel region. |
| `className` | `string` | — | Extra classes on the region wrapper. |

## Props — `CarouselItem`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `className` | `string` | `'basis-full'` | Width/basis classes controlling items per view, e.g. `basis-1/2 sm:basis-1/3`. |

## Accessibility

- Region uses `role="region"` + `aria-roledescription="carousel"`; slides use `aria-roledescription="slide"`.
- The region is focusable; Left/Right arrow keys move between slides.
- Dots are a `tablist` with `aria-selected`; arrow buttons disable at the ends.

## Usage

```tsx
import { Carousel, CarouselItem } from 'components/Carousel'

<Carousel label="Client testimonials">
  {testimonials.map((t) => (
    <CarouselItem key={t.name} className="basis-full sm:basis-1/2">
      <TestimonialCard {...t} />
    </CarouselItem>
  ))}
</Carousel>
```

Logo strip with free drag and looping:

```tsx
<Carousel showArrows={false} showDots={false} options={{ dragFree: true, loop: true }}>
  {logos.map((logo) => (
    <CarouselItem key={logo} className="basis-1/3 sm:basis-1/5">
      <LogoTile name={logo} />
    </CarouselItem>
  ))}
</Carousel>
```
