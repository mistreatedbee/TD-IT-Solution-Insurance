// AUTO-GENERATED — do not edit manually.
// Re-run the design system builder to regenerate.

import type { ComponentPreviewModule } from './previewTypes';
import __AccordionPreviews from './Accordion/Accordion.previews';
import __ArrowLinkPreviews from './ArrowLink/ArrowLink.previews';
import __AssetBadgePreviews from './AssetBadge/AssetBadge.previews';
import __AvatarPreviews from './Avatar/Avatar.previews';
import __BadgePreviews from './Badge/Badge.previews';
import __ButtonPreviews from './Button/Button.previews';
import __CardPreviews from './Card/Card.previews';
import __CarouselPreviews from './Carousel/Carousel.previews';
import __FeatureCardPreviews from './FeatureCard/FeatureCard.previews';
import __GlassCardPreviews from './GlassCard/GlassCard.previews';
import __IndustryCardPreviews from './IndustryCard/IndustryCard.previews';
import __InputPreviews from './Input/Input.previews';
import __LogoPreviews from './Logo/Logo.previews';
import __LogoCloudPreviews from './LogoCloud/LogoCloud.previews';
import __RevealPreviews from './Reveal/Reveal.previews';
import __SectionPreviews from './Section/Section.previews';
import __SectionHeadingPreviews from './SectionHeading/SectionHeading.previews';
import __StatBlockPreviews from './StatBlock/StatBlock.previews';
import __StepItemPreviews from './StepItem/StepItem.previews';
import __TestimonialCardPreviews from './TestimonialCard/TestimonialCard.previews';
const __contextMd: Record<string, string> = {
  "Accordion": `# Accordion

FAQ-style disclosure list. Each item shows a question row with a rotating +/− indicator and reveals
its answer with a smooth height transition.

## Usage

\`\`\`tsx
import { Accordion, AccordionItem } from 'components/Accordion'

<Accordion defaultOpen={['support']}>
  <AccordionItem value="support" title="What support hours do you offer?">
    7am–7pm on business days, with 24/7 on-call for priority incidents.
  </AccordionItem>
  <AccordionItem value="onboarding" title="How long does onboarding take?">
    Most environments are onboarded within two weeks.
  </AccordionItem>
</Accordion>
\`\`\`

## Props

### \`Accordion\`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`allowMultiple\` | \`boolean\` | \`false\` | Let more than one item stay open at a time. |
| \`defaultOpen\` | \`string[]\` | \`[]\` | Item \`value\`s expanded on first render. |
| \`className\` | \`string\` | \`''\` | Extra classes on the list wrapper. |
| \`children\` | \`ReactNode\` | — | \`AccordionItem\` elements. |

### \`AccordionItem\`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`value\` | \`string\` | — | Unique id used for open/close tracking. |
| \`title\` | \`ReactNode\` | — | Question / summary shown in the trigger row. |
| \`children\` | \`ReactNode\` | — | Answer content. |
| \`disabled\` | \`boolean\` | \`false\` | Prevents expanding the item. |

## Notes

- Open state is managed internally; \`AccordionItem\` must be rendered inside \`Accordion\`.
- Panel height is measured with a \`ResizeObserver\`, so dynamic content animates correctly.
- Triggers are real buttons with \`aria-expanded\` / \`aria-controls\`, and panels use \`role="region"\`.
`,
  "ArrowLink": `# ArrowLink

Inline text link ("Learn more" style) with a trailing arrow that slides on hover. Use it for secondary, low-emphasis actions inside cards and at the end of content sections — not as a primary CTA (use a Button for that).

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`children\` | \`ReactNode\` | — | Link label text. |
| \`href\` | \`string\` | — | Destination URL. Omitted when \`disabled\`. |
| \`size\` | \`'sm' \\| 'md' \\| 'lg'\` | \`'md'\` | Text and icon scale. |
| \`tone\` | \`'default' \\| 'muted' \\| 'inverse'\` | \`'default'\` | Color treatment; use \`inverse\` on dark surfaces. |
| \`reverse\` | \`boolean\` | \`false\` | Puts the arrow before the label, pointing left (back navigation). |
| \`disabled\` | \`boolean\` | \`false\` | Non-interactive, dimmed, removed from tab order. |

All other native \`<a>\` attributes (\`target\`, \`rel\`, \`onClick\`, \`aria-*\`, …) are forwarded.

## Usage

\`\`\`tsx
import { ArrowLink } from 'components/ArrowLink'

<ArrowLink href="/services">Learn more</ArrowLink>

<ArrowLink href="/services" reverse size="sm" tone="muted">
  Back to overview
</ArrowLink>
\`\`\`

## Notes

- Hover and keyboard focus both trigger the arrow slide and underline, so the affordance is not mouse-only.
- Motion is disabled automatically under \`prefers-reduced-motion\`.
- The arrow is \`aria-hidden\`; keep the label descriptive (avoid bare "Click here").
`,
  "AssetBadge": `# AssetBadge

Mini icon + label card representing a covered asset type (vehicle, laptop, phone, tablet, TV, business equipment). Designed for the coverage overview grid, where several badges sit side by side to show what a customer's plan protects.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`type\` | \`'vehicle' \\| 'laptop' \\| 'phone' \\| 'tablet' \\| 'tv' \\| 'business'\` | — | Asset type; sets the default icon and label. |
| \`label\` | \`string\` | type default | Override the displayed label. |
| \`description\` | \`string\` | — | Optional secondary line (count, coverage note). |
| \`selected\` | \`boolean\` | \`false\` | Filled/active treatment with a check marker. |
| \`disabled\` | \`boolean\` | \`false\` | Dims the badge and blocks interaction. |
| \`size\` | \`'sm' \\| 'md'\` | \`'md'\` | Visual density. |
| \`onClick\` | \`() => void\` | — | When provided, renders as a toggle button with \`aria-pressed\`. |
| \`className\` | \`string\` | \`''\` | Extra classes on the root element. |

## Usage

\`\`\`tsx
import { AssetBadge } from 'components/AssetBadge'

<div className="grid grid-cols-3 gap-3">
  <AssetBadge type="vehicle" description="2 covered" selected />
  <AssetBadge type="laptop" description="1 covered" selected />
  <AssetBadge type="tv" description="Not covered" />
</div>
\`\`\`

Toggleable:

\`\`\`tsx
<AssetBadge type="phone" selected={isOn} onClick={() => setIsOn(!isOn)} />
\`\`\`

## Notes

- Static badges render as a \`div\`; passing \`onClick\` upgrades them to an accessible button with focus ring and pressed state.
- Icons come from \`lucide-react\` and are hidden from screen readers; the text label carries meaning.
`,
  "Avatar": `# Avatar

Circular headshot placeholder with an electric-blue tint background. Used in testimonial author blocks and anywhere a person is represented.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`src\` | \`string\` | — | Image URL. Falls back to initials/glyph if missing or if loading fails. |
| \`name\` | \`string\` | — | Person's name; used for alt text and to derive up to two initials. |
| \`size\` | \`'sm' \\| 'md' \\| 'lg'\` | \`'md'\` | 32px, 48px, or 64px circle. |
| \`className\` | \`string\` | \`''\` | Extra classes for the root element. |

## Usage

\`\`\`tsx
import { Avatar } from 'components/Avatar'

<Avatar name="Marcus Hale" />
<Avatar src="https://example.com/marcus.jpg" name="Marcus Hale" size="lg" />
\`\`\`

## Notes

- Handles image load errors by reverting to initials, then to a generic person glyph.
- When no image is rendered, the root gets \`role="img"\` with an accessible label.
`,
  "Badge": `# Badge

Small pill label used for tags such as asset categories, statuses, and plan highlights.

## Usage

\`\`\`tsx
import { Badge } from 'components/Badge'

<Badge>Hardware</Badge>
<Badge tone="gold">Premium Plan</Badge>
<Badge tone="emerald">Active</Badge>
\`\`\`

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`tone\` | \`'neutral' \\| 'gold' \\| 'emerald'\` | \`'neutral'\` | Color treatment. Neutral for categories, gold for plan/accent highlights, emerald for success states. |
| \`size\` | \`'sm' \\| 'md'\` | \`'sm'\` | Pill size and padding. |
| \`icon\` | \`ReactNode\` | – | Optional leading icon or dot (rendered \`aria-hidden\`). |
| \`children\` | \`ReactNode\` | – | Badge label. |
| \`className\` | \`string\` | – | Extra classes appended to the root. |

Also accepts any standard \`<span>\` attributes.

## Notes

- Renders a non-interactive \`<span>\`; do not use for actions — use a Button instead.
- Color alone should not convey meaning; keep the label descriptive (e.g. "Active", not just a green dot).
`,
  "Button": `# Button

Core call-to-action primitive for TD IT Solutions. Four variants cover the full hierarchy of actions across light, dark, and gradient surfaces.

## Variants

- \`primary\` — electric-blue gradient pill with a subtle hover scale. One per view; the main CTA.
- \`secondary\` — outlined navy, rounded rectangle. Inverts to solid navy on hover.
- \`ghost\` — white-on-navy reversed treatment. Use only on dark or gradient sections.
- \`tertiary\` — text-only link button with underline on hover. Lowest emphasis.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`variant\` | \`'primary' \\| 'secondary' \\| 'ghost' \\| 'tertiary'\` | \`'primary'\` | Visual emphasis level. |
| \`size\` | \`'sm' \\| 'md' \\| 'lg'\` | \`'md'\` | Padding and text scale. |
| \`fullWidth\` | \`boolean\` | \`false\` | Stretches the button to its container width. |
| \`loading\` | \`boolean\` | \`false\` | Shows a spinner, disables interaction, sets \`aria-busy\`. |
| \`leadingIcon\` | \`ReactNode\` | — | Icon rendered before the label (replaced by the spinner while loading). |
| \`trailingIcon\` | \`ReactNode\` | — | Icon rendered after the label. |
| \`disabled\` | \`boolean\` | \`false\` | Non-interactive state. |
| \`className\` | \`string\` | — | Extra classes appended last. |

All other native \`<button>\` attributes (\`onClick\`, \`type\`, \`aria-*\`, …) are forwarded.

## Usage

\`\`\`tsx
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
\`\`\`

## Guidelines

- Pair one \`primary\` with at most one \`secondary\` or \`tertiary\` action in the same group.
- Use \`ghost\` exclusively on dark backgrounds — it has no contrast on white.
- Keep labels short and action-led ("Request a quote", not "Click here").
- Icons are decorative; the label always carries the meaning. For icon-only actions, pass an \`aria-label\`.
`,
  "Card": `# Card

Premium white surface used as the base container for services, benefits, and general content blocks. Rounded 16px corners, soft layered shadow, and — when interactive — a hover lift plus an electric-blue accent edge that wipes in from the left.

## Usage

\`\`\`tsx
import { Card, CardHeader, CardBody, CardFooter } from 'components/Card'

<Card as="article">
  <CardHeader icon={<ShieldCheckIcon className="h-5 w-5" />} title="Cybersecurity" description="Endpoint protection." />
  <CardBody>Continuous scanning with a 15-minute response SLA.</CardBody>
  <CardFooter>
    <a href="/services">Learn more</a>
  </CardFooter>
</Card>
\`\`\`

## Props

### Card
| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`children\` | \`ReactNode\` | – | Card contents |
| \`padding\` | \`'none' \\| 'sm' \\| 'md' \\| 'lg'\` | \`'md'\` | Inner padding scale |
| \`interactive\` | \`boolean\` | \`true\` | Enables hover lift and blue accent edge |
| \`as\` | \`'div' \\| 'article' \\| 'section' \\| 'li'\` | \`'div'\` | Semantic element to render |
| \`className\` | \`string\` | \`''\` | Extra classes (e.g. width constraints) |

All other \`div\` props are forwarded. Passing \`onClick\` automatically makes the card focusable (\`role="button"\`, \`tabIndex=0\`) with a visible focus ring.

### CardHeader
\`title\` (string, required), \`description\` (string), \`icon\` (ReactNode, rendered in a blue tinted tile), \`className\`.

### CardBody / CardFooter
\`children\`, \`className\`. \`CardFooter\` adds a top divider and horizontal action row.

## Guidance
- Use \`interactive={false}\` for static stat or info blocks that aren't links.
- Set width via \`className\` (e.g. \`max-w-sm\`) or let a grid parent control it.
- Keep card headings at \`h3\` level inside sections with an \`h2\`.
`,
  "Carousel": `# Carousel

Horizontally scrollable, snapping container with drag/swipe support. Built on \`embla-carousel-react\`. Use it for testimonials, industry cards, or client logo strips where horizontal space is constrained.

## Props — \`Carousel\`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`options\` | \`EmblaOptionsType\` | \`{ align: 'start', containScroll: 'trimSnaps' }\` | Embla options (\`loop\`, \`dragFree\`, \`align\`, …). Merged over the defaults. |
| \`showArrows\` | \`boolean\` | \`true\` | Show previous/next arrow buttons. |
| \`showDots\` | \`boolean\` | \`true\` | Show dot pagination (hidden when there is only one snap). |
| \`setApi\` | \`(api: CarouselApi) => void\` | — | Receives the Embla API for external control (autoplay, programmatic scroll). |
| \`label\` | \`string\` | \`'Carousel'\` | Accessible label for the carousel region. |
| \`className\` | \`string\` | — | Extra classes on the region wrapper. |

## Props — \`CarouselItem\`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`className\` | \`string\` | \`'basis-full'\` | Width/basis classes controlling items per view, e.g. \`basis-1/2 sm:basis-1/3\`. |

## Accessibility

- Region uses \`role="region"\` + \`aria-roledescription="carousel"\`; slides use \`aria-roledescription="slide"\`.
- The region is focusable; Left/Right arrow keys move between slides.
- Dots are a \`tablist\` with \`aria-selected\`; arrow buttons disable at the ends.

## Usage

\`\`\`tsx
import { Carousel, CarouselItem } from 'components/Carousel'

<Carousel label="Client testimonials">
  {testimonials.map((t) => (
    <CarouselItem key={t.name} className="basis-full sm:basis-1/2">
      <TestimonialCard {...t} />
    </CarouselItem>
  ))}
</Carousel>
\`\`\`

Logo strip with free drag and looping:

\`\`\`tsx
<Carousel showArrows={false} showDots={false} options={{ dragFree: true, loop: true }}>
  {logos.map((logo) => (
    <CarouselItem key={logo} className="basis-1/3 sm:basis-1/5">
      <LogoTile name={logo} />
    </CarouselItem>
  ))}
</Carousel>
\`\`\`
`,
  "FeatureCard": `# FeatureCard

Icon-led card used to describe services and product benefits. Composed of a duotone icon tile, a title, a thin electric-blue rule, and gray supporting copy.

## When to use

- Service/benefit grids on marketing or solution pages
- Three- or four-up feature rows (\`grid gap-6 md:grid-cols-3\`)

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`icon\` | \`ComponentType<{ className?: string; strokeWidth?: number }>\` | — | Icon component (e.g. from \`lucide-react\`), rendered inside the duotone tile. |
| \`title\` | \`string\` | — | Card heading (\`h3\`). |
| \`description\` | \`ReactNode\` | — | Supporting copy below the accent rule. |
| \`footer\` | \`ReactNode\` | — | Optional footer, e.g. a CTA link or tag row. |
| \`align\` | \`'left' \\| 'center'\` | \`'left'\` | Content alignment. |
| \`href\` | \`string\` | — | Renders the card as an anchor with hover/focus treatment. |
| \`className\` | \`string\` | — | Extra classes merged onto the card root. |

## Behavior

- Non-interactive cards render as \`<article>\`; passing \`href\` renders an \`<a>\` with a visible focus ring.
- On hover of a linked card, the icon tile fills blue and the accent rule extends.

## Usage

\`\`\`tsx
import { ShieldCheckIcon } from 'lucide-react'
import { FeatureCard } from 'components/FeatureCard'

<div className="grid gap-6 md:grid-cols-3">
  <FeatureCard
    icon={ShieldCheckIcon}
    title="Managed Cybersecurity"
    description="Continuous monitoring, endpoint protection, and incident response."
  />
</div>
\`\`\`
`,
  "GlassCard": `# GlassCard

Semi-transparent, blurred glassmorphism card. Used for benefits grids and small floating "flair" elements layered over gradient, photographic, or dark backgrounds.

## When to use

- Benefit / feature tiles over a dark or gradient hero section
- Small floating stat or badge cards overlapping imagery
- Any surface that should read as translucent rather than solid

Needs a visually rich background behind it — on a flat solid surface the blur has nothing to work with.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`icon\` | \`ReactNode\` | – | Visual rendered in a tinted square above the title |
| \`title\` | \`ReactNode\` | – | Card heading (renders as \`h3\`) |
| \`description\` | \`ReactNode\` | – | Supporting copy under the heading |
| \`tone\` | \`'light' \\| 'dark'\` | \`'light'\` | \`light\` for dark/gradient backgrounds, \`dark\` for light ones |
| \`padding\` | \`'none' \\| 'sm' \\| 'md' \\| 'lg'\` | \`'md'\` | Inner spacing |
| \`interactive\` | \`boolean\` | \`false\` | Hover lift, brighter surface, focus ring — for clickable cards |
| \`children\` | \`ReactNode\` | – | Custom body content, rendered below title/description |

Also accepts all standard \`div\` attributes (\`className\`, \`onClick\`, \`role\`, \`tabIndex\`, …).

## Usage

\`\`\`tsx
import { ShieldCheckIcon } from 'lucide-react'
import { GlassCard } from 'components/GlassCard'

<GlassCard
  icon={<ShieldCheckIcon className="h-5 w-5" />}
  title="Enterprise-grade security"
  description="24/7 monitoring and compliance-ready reporting."
/>
\`\`\`

Clickable tile:

\`\`\`tsx
<GlassCard interactive role="button" tabIndex={0} onClick={onSelect} title="Managed IT" />
\`\`\`

Custom content only:

\`\`\`tsx
<GlassCard tone="dark" padding="sm">
  <p className="text-lg font-semibold">99.98%</p>
</GlassCard>
\`\`\`

## Accessibility

- Title renders as an \`h3\` — keep the surrounding heading hierarchy consistent.
- The icon slot is \`aria-hidden\`; convey meaning through the title or description.
- When \`interactive\`, supply \`role="button"\` and \`tabIndex={0}\` (or wrap in a real link/button) so keyboard users get the focus ring.
`,
  "IndustryCard": `# IndustryCard

Card representing an industry vertical served. Shows a colored top accent bar, an icon, a title, and a short description. Used in grids on marketing and solutions pages.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`title\` | \`string\` | — | Industry name shown as the card title. |
| \`description\` | \`string\` | — | Short supporting copy. |
| \`icon\` | \`LucideIcon\` | \`BuildingIcon\` | Icon rendered above the title. |
| \`accent\` | \`'blue' \\| 'green' \\| 'amber' \\| 'purple' \\| 'red' \\| 'slate'\` | \`'blue'\` | Accent bar and icon color. |
| \`onClick\` | \`() => void\` | — | When provided, the card renders as a button with hover/focus states. |
| \`className\` | \`string\` | \`''\` | Extra classes for the card root. |

## Usage

\`\`\`tsx
import { HeartPulseIcon } from 'lucide-react'
import { IndustryCard } from 'components/IndustryCard'

<IndustryCard
  title="Healthcare"
  description="HIPAA-compliant IT support and 24/7 monitoring."
  icon={HeartPulseIcon}
  accent="blue"
/>
\`\`\`

Grid layout:

\`\`\`tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {industries.map((i) => (
    <IndustryCard key={i.title} {...i} onClick={() => select(i)} />
  ))}
</div>
\`\`\`

## Notes

- Titles render as \`h3\`; place inside a section with an \`h2\` heading.
- The accent bar and icon are decorative and hidden from assistive tech.
`,
  "Input": `# Input

Base form field for the contact / quote forms. Renders a labelled single-line input (text, email, tel, url, password) or a textarea, with an electric-blue focus ring and a red error state.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`label\` | \`string\` | — | Required visible label, wired to the field via \`htmlFor\`. |
| \`type\` | \`'text' \\| 'email' \\| 'tel' \\| 'url' \\| 'password' \\| 'textarea'\` | \`'text'\` | Field type; \`textarea\` renders a multi-line field. |
| \`hint\` | \`string\` | — | Helper text below the field (hidden when \`error\` is set). |
| \`error\` | \`string\` | — | Error message; switches the field to its error state and sets \`aria-invalid\`. |
| \`hideLabel\` | \`boolean\` | \`false\` | Visually hides the label but keeps it for screen readers. |
| \`rows\` | \`number\` | \`4\` | Row count for the textarea variant. |
| \`className\` | \`string\` | \`''\` | Extra classes on the outer wrapper. |

All other native input/textarea attributes (\`placeholder\`, \`value\`, \`onChange\`, \`required\`, \`disabled\`, \`name\`, …) are forwarded. \`ref\` is forwarded to the underlying element.

## Usage

\`\`\`tsx
import { Input } from 'components/Input'

<Input label="Full name" placeholder="Jane Doe" required />

<Input
  label="Work email"
  type="email"
  error="Enter a valid email address."
/>

<Input label="How can we help?" type="textarea" rows={5} />
\`\`\`

## Notes

- Focus uses a blue-600 border with a soft blue ring; error states use red-500 / red-600.
- Messages are linked with \`aria-describedby\`, so both hints and errors are announced.
`,
  "Logo": `# Logo

Brand mark for TD IT Solution Insurance: a minimal geometric shield/lock glyph paired with a navy typographic wordmark. This is a **placeholder** — no final brand art was supplied, so the glyph and type are designed to be swapped for the real asset without changing the component API.

## Usage

\`\`\`tsx
import { Logo } from 'components/Logo'

<Logo href="/" size="md" />
\`\`\`

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`variant\` | \`'full' \\| 'glyph' \\| 'wordmark'\` | \`'full'\` | Which parts of the mark to render. Use \`glyph\` for collapsed nav or favicons-in-UI, \`wordmark\` when a separate icon is already present. |
| \`size\` | \`'sm' \\| 'md' \\| 'lg'\` | \`'md'\` | Overall scale of glyph and type. |
| \`tone\` | \`'navy' \\| 'light'\` | \`'navy'\` | \`navy\` for light backgrounds, \`light\` for navy/dark surfaces. |
| \`href\` | \`string\` | — | When provided, renders as an anchor with a focus ring. |
| \`label\` | \`string\` | \`'TD IT Solution Insurance'\` | Accessible label for the mark. |
| \`className\` | \`string\` | — | Extra classes on the lockup wrapper. |

Also exports \`LogoGlyph\` for cases where only the raw SVG shield/lock is needed.

## Examples

\`\`\`tsx
{/* Header lockup */}
<Logo href="/" />

{/* Collapsed sidebar */}
<Logo variant="glyph" size="sm" />

{/* Footer on navy */}
<footer className="bg-[#0B2A4A] p-8">
  <Logo tone="light" size="lg" />
</footer>
\`\`\`

## Notes

- Keep clear space around the lockup roughly equal to the glyph height.
- Do not recolor the wordmark outside the two provided tones.
`,
  "LogoCloud": `# LogoCloud

A full-width trust strip that scrolls a continuous, seamless marquee of monochrome partner or client logos. Logos render as muted placeholder wordmarks by default and colorize on hover; passing \`src\` renders real images (grayscale until hovered).

## Usage

\`\`\`tsx
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
\`\`\`

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`title\` | \`string\` | – | Optional uppercase eyebrow above the marquee. Also used as the section's accessible label. |
| \`logos\` | \`LogoCloudItem[]\` | \`DEFAULT_LOGOS\` | Logos to display. Each item is \`{ name, src? }\`. Empty arrays fall back to the defaults. |
| \`speed\` | \`number\` | \`60\` | Scroll speed in pixels per second. |
| \`direction\` | \`'left' \\| 'right'\` | \`'left'\` | Marquee direction. |
| \`pauseOnHover\` | \`boolean\` | \`true\` | Pauses scrolling while the pointer is over the strip. |
| \`fadeEdges\` | \`boolean\` | \`true\` | Masks the left/right edges so logos fade out instead of clipping. |
| \`className\` | \`string\` | \`''\` | Extra classes on the wrapping \`<section>\` (e.g. background or vertical padding overrides). |

## Notes

- The logo list is duplicated once and animated with \`framer-motion\`'s \`useAnimationFrame\` for a seamless, jitter-free loop; the duplicate copy is \`aria-hidden\`.
- Rendered as a labelled \`<section>\` with a \`<ul>\`/\`<li>\` list, so the logos are announced once by screen readers.
- Best used between hero and feature sections, on a white or very light surface.
`,
  "Reveal": `# Reveal

Scroll-triggered animation wrapper. Fades and slides its children into place when they enter the viewport, using the design system's calm motion timing (600ms, soft ease-out curve). Respects \`prefers-reduced-motion\` by rendering children statically.

## Usage

\`\`\`tsx
import { Reveal } from 'components/Reveal'

<Reveal>
  <h2>Managed IT, quietly handled</h2>
</Reveal>
\`\`\`

Stagger a group by increasing \`delay\`:

\`\`\`tsx
{items.map((item, i) => (
  <Reveal key={item.id} delay={i * 0.12}>
    <ServiceCard {...item} />
  </Reveal>
))}
\`\`\`

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`children\` | \`ReactNode\` | — | Content to reveal. |
| \`direction\` | \`'up' \\| 'down' \\| 'left' \\| 'right' \\| 'none'\` | \`'up'\` | Direction the content travels from. |
| \`distance\` | \`number\` | \`24\` | Travel distance in pixels. |
| \`delay\` | \`number\` | \`0\` | Delay before animating, in seconds. |
| \`duration\` | \`number\` | \`0.6\` | Animation duration in seconds. |
| \`repeat\` | \`boolean\` | \`false\` | Replay each time the element re-enters view. |
| \`amount\` | \`number\` | \`0.2\` | Fraction of the element visible before triggering. |
| \`as\` | \`keyof JSX.IntrinsicElements\` | \`'div'\` | Underlying element to render. |
| \`className\` | \`string\` | — | Classes applied to the wrapper. |

All other props are forwarded to the underlying motion element.

## Notes

- Purely a layout-neutral wrapper — it adds no spacing or visual styling of its own.
- Keep delays under ~0.4s so content never feels slow to appear.
- Avoid nesting \`Reveal\` inside \`Reveal\`; stagger siblings instead.
`,
  "Section": `# Section

Layout wrapper for page sections. Handles the alternating white / warm-gray backgrounds and the standard vertical rhythm (80px mobile, 120px desktop), plus a centered max-width container.

## Usage

\`\`\`tsx
import { Section } from 'components/Section'

<Section>
  <h2>Managed services</h2>
</Section>
<Section background="warm">
  <h2>Cloud migration</h2>
</Section>
\`\`\`

Alternate \`background\` between \`white\` and \`warm\` down the page so adjacent sections read as separate blocks.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`background\` | \`'white' \\| 'warm'\` | \`'white'\` | Section background. \`warm\` uses the warm-gray surface. |
| \`spacing\` | \`'default' \\| 'compact' \\| 'none'\` | \`'default'\` | Vertical padding. \`default\` = 80px / 120px (lg), \`compact\` = 48px / 80px, \`none\` = 0. |
| \`width\` | \`'narrow' \\| 'default' \\| 'wide' \\| 'full'\` | \`'default'\` | Max width of the inner container. |
| \`bleed\` | \`boolean\` | \`false\` | Skip the inner container so children span the full width (e.g. full-bleed media). |
| \`as\` | \`'section' \\| 'div' \\| 'header' \\| 'footer' \\| 'main' \\| 'article'\` | \`'section'\` | Rendered element, for correct document semantics. |
| \`className\` | \`string\` | — | Extra classes on the outer element. |

All other \`HTMLAttributes\` (e.g. \`id\`, \`aria-labelledby\`) are forwarded to the root element.

## Notes

- Pair with a heading and \`aria-labelledby\` for accessible landmarks.
- Use \`bleed\` with \`spacing="none"\` for hero or full-width imagery.
`,
  "SectionHeading": `# SectionHeading

Introduces a major page section with a consistent eyebrow label, title, and supporting subtitle. Use it at the top of every marketing or dashboard section so hierarchy and spacing stay uniform.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`eyebrow\` | \`string\` | – | Small uppercase label above the title |
| \`title\` | \`string\` | required | Main section title |
| \`subtitle\` | \`string\` | – | Supporting copy below the title |
| \`align\` | \`'left' \\| 'center'\` | \`'left'\` | Block alignment |
| \`tone\` | \`'light' \\| 'dark'\` | \`'light'\` | Use \`dark\` on dark backgrounds |
| \`size\` | \`'md' \\| 'lg'\` | \`'md'\` | Title scale |
| \`as\` | \`'h1' \\| 'h2' \\| 'h3'\` | \`'h2'\` | Heading level for document outline |
| \`actions\` | \`ReactNode\` | – | Trailing actions (left align only pushes them to the right on \`sm+\`) |
| \`className\` | \`string\` | – | Extra classes on the wrapper |

## Usage

\`\`\`tsx
<SectionHeading
  eyebrow="Managed IT"
  title="Technology that keeps your business running"
  subtitle="Proactive monitoring and rapid support."
/>
\`\`\`

Centered with an action:

\`\`\`tsx
<SectionHeading
  align="center"
  size="lg"
  title="Our services"
  actions={<button type="button">View all</button>}
/>
\`\`\`

## Guidance

- Keep only one \`as="h1"\` per page; default \`h2\` fits most sections.
- Keep subtitles to one or two lines — the block caps at \`max-w-2xl\` for readability.
- Pair \`tone="dark"\` with dark section backgrounds only.
`,
  "StatBlock": `# StatBlock

Displays a headline metric: a large bold navy numeral, an electric-blue accent underline, and an uppercase label. The numeral counts up (ease-out) the first time the block scrolls into view; the underline draws in alongside it. Respects \`prefers-reduced-motion\`.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`value\` | \`number\` | — | Target value to count up to. |
| \`label\` | \`string\` | — | Uppercase label under the numeral. |
| \`prefix\` | \`string\` | — | Text before the numeral (e.g. \`"\$"\`). |
| \`suffix\` | \`string\` | — | Text after the numeral (e.g. \`"%"\`, \`"+"\`). |
| \`decimals\` | \`number\` | \`0\` | Decimal places displayed. |
| \`duration\` | \`number\` | \`1600\` | Count-up duration in ms. |
| \`animate\` | \`boolean\` | \`true\` | Set \`false\` to render the final value immediately. |
| \`align\` | \`'left' \\| 'center'\` | \`'left'\` | Alignment of numeral, underline, and label. |
| \`size\` | \`'md' \\| 'lg'\` | \`'lg'\` | Numeral scale and underline width. |
| \`className\` | \`string\` | — | Extra classes on the root element. |

## Usage

\`\`\`tsx
import { StatBlock } from 'components/StatBlock'

<div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
  <StatBlock size="md" value={99.9} decimals={1} suffix="%" label="Uptime" />
  <StatBlock size="md" value={15} suffix=" min" label="Response time" />
  <StatBlock size="md" value={340} suffix="+" label="Clients served" />
</div>
\`\`\`

## Notes

- Uses \`framer-motion\`'s \`useInView\` (triggers once at 40% visibility) plus a \`requestAnimationFrame\` count-up.
- The animated numeral is \`aria-hidden\`; an accessible label exposes the final formatted value to screen readers.
- Numerals use \`tabular-nums\` so the layout doesn't jitter while counting.
`,
  "StepItem": `# StepItem

A single step in the 4-step "How It Works" timeline. Renders a large watermark numeral, an optional icon, a step label, title, description, and an animated dashed connector to the next step.

Render inside an \`<ol>\` — the component is an \`<li>\`.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`step\` | \`number\` | — | Position in the timeline; shown as the watermark numeral and "Step N" label. |
| \`title\` | \`string\` | — | Short step title (renders as \`h3\`). |
| \`description\` | \`string\` | — | Supporting copy. |
| \`icon\` | \`ReactNode\` | — | Optional icon above the title (lucide-react, 20px). |
| \`isLast\` | \`boolean\` | \`false\` | Hides the connector — use on the final step. |
| \`isActive\` | \`boolean\` | \`false\` | Highlights the numeral and icon tile with the secondary color. |
| \`orientation\` | \`'horizontal' \\| 'vertical'\` | \`'horizontal'\` | Connector direction. Horizontal connectors only render at \`lg\` and up. |
| \`delay\` | \`number\` | \`0\` | Stagger delay in seconds for the fade-up entrance. |
| \`className\` | \`string\` | \`''\` | Extra classes on the root \`li\`. |

## Usage

\`\`\`tsx
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
\`\`\`

## Notes

- Uses design system tokens: \`text-primary\`, \`text-secondary\`, \`secondary\`, \`card\`, \`card-elevated\`, \`--radius-button\`.
- Entrance and connector animation use framer-motion; the connector marquee loops continuously.
- Watermark numeral and connector are \`aria-hidden\`; the "Step N" label carries the ordinal for screen readers.
`,
  "TestimonialCard": `# TestimonialCard

A quote card for client testimonials. Shows an optional monochrome (grayscale, dimmed) client logo, an italic quote accented by an oversized light quotation mark, and an author row with avatar (or initials placeholder), title, and company.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| \`quote\` | \`string\` | — | Testimonial text, rendered in italics. Required. |
| \`authorName\` | \`string\` | — | Author name. Required; also used for the initials fallback. |
| \`authorTitle\` | \`string\` | — | Author's job title. |
| \`company\` | \`string\` | — | Company name, shown after the title. |
| \`avatarUrl\` | \`string\` | — | Avatar image. Omit to show an initials placeholder. |
| \`logoUrl\` | \`string\` | — | Client logo, rendered grayscale at 60% opacity. |
| \`logoAlt\` | \`string\` | \`"{company} logo"\` | Alt text for the logo. |
| \`className\` | \`string\` | \`''\` | Extra classes on the card root. |

## Usage

\`\`\`tsx
import { TestimonialCard } from 'components/TestimonialCard'

<TestimonialCard
  logoUrl="/logos/northwind.svg"
  quote="They migrated our infrastructure with zero downtime."
  authorName="Amara Osei"
  authorTitle="Director of IT"
  company="Northwind Freight"
  avatarUrl="/avatars/amara.jpg"
/>
\`\`\`

## Notes

- Uses semantic \`figure\` / \`blockquote\` / \`figcaption\` markup; the decorative quote mark is \`aria-hidden\`.
- The card stretches to \`h-full\`, so cards in a grid row match heights.
- Exports \`getInitials(name)\` for reuse.
`
};

export const componentRegistry: ComponentPreviewModule[] = [
__AccordionPreviews,
__ArrowLinkPreviews,
__AssetBadgePreviews,
__AvatarPreviews,
__BadgePreviews,
__ButtonPreviews,
__CardPreviews,
__CarouselPreviews,
__FeatureCardPreviews,
__GlassCardPreviews,
__IndustryCardPreviews,
__InputPreviews,
__LogoPreviews,
__LogoCloudPreviews,
__RevealPreviews,
__SectionPreviews,
__SectionHeadingPreviews,
__StatBlockPreviews,
__StepItemPreviews,
__TestimonialCardPreviews].

filter((m) => m && m.componentName).
map((m) => ({ ...m, contextMd: __contextMd[m.componentName] ?? m.contextMd })).
sort((a, b) => a.componentName.localeCompare(b.componentName));