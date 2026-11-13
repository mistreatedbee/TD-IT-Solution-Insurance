Use this system for every screen of the TD IT Solution Insurance mobile app and website: protect-and-recover for devices and vehicles, in a calm, glass-and-navy look built from the logo.

## Content fundamentals

- Write plain South African English: colour, licence (noun), programme. Sentence case everywhere, including buttons and headings.
- Speak to the person as "you" and name the company as "we". Be calm and specific. Say what happened and what happens next ("We've told your security partner. They will contact you within 30 minutes."), never "Oops!".
- Do not use fear to sell. Show what is protected and what to do, not worst cases.
- Money is written `R1 250` with a space for thousands and no decimals unless cents matter; dates are `13 Nov 2026`; times are 24-hour (`14:12`); phone numbers are `+27 82 123 4567`.
- Buttons start with a verb and run one to three words: "Register an asset", "View on map", "Report stolen".
- Status words are fixed: PROTECTED, TRACKING, PENDING VERIFICATION, LOST, STOLEN, RECOVERED, CLAIM OPEN.
- Never use emoji. Icons come from the `Icon` set.
- Tagline: "Protect what you own. Recover it if it goes missing."

## Colour

The three logo colours are the brand: `brand-navy` for ground and wordmark, `brand-orange` for the one action and the leading chevron, `brand-blue` for strokes and information. Everything else supports them.

- The app has two themes, Day and Night. Set `data-theme="day"` or `"night"` on the root and use tokens only; never hard-code hex values.
- Page ground is `bg-page`; cards are `glass-fill` (frosted) or `bg-raised` (solid, for long text and forms). Body text is `ink`; secondary text is `ink-muted`.
- The primary button is `action-primary` with `on-action-primary` text. White text on orange fails contrast: never use it.
- Orange as text is `accent-text` (deep amber on Day, brand orange on Night). `brand-orange` itself is never text on a light ground.
- Blue as text is `link`. `brand-blue` is for strokes, chart series and large icons only. On navy or Night grounds use `brand-blue-bright` for strokes and icons.
- Status colours `success`, `danger`, `warning` sit on their `-bg` tints and always come with an icon and a word. `success` and `danger` differ in lightness so they stay distinct for colour-blind users.
- Focus is a 2px solid `focus-ring` with a 2px offset on every focusable element.
- All text pairs in the tokens meet 4.5:1 in both themes; control borders and the focus ring meet 3:1.

## Typography

Two families, one job each. `display` (Zilla Slab) is the slab serif that echoes the logo wordmark: use it for hero headlines, screen titles and big figures (`display-xl`, `display-lg`, `display-md`, `figure`). `sans` (Plus Jakarta Sans) is the interface face for everything else (`title`, `body-lg`, `body`, `body-sm`, `label`, `label-sm`).

- Never set body copy in the slab. Never use the slab below 20px.
- Both families are shipped as files in `fonts/` (latin subset, open licence); load them with the generated `@font-face` rules, not from a font CDN.
- Use `figure` for premiums, cover amounts and counts: "R189".

## Glass surfaces

Glass is the signature of the product: translucent navy-tinted cards with a soft blur, a one-pixel light edge and a deep shadow, floating over a gradient with blue and orange light.

- A glass surface is always four things together: `glass-fill`, `glass-border`, `shadow-glass` and `backdrop-filter: blur(var(--blur-glass))`. The tab bar and sheets use `blur-glass-strong` and `shadow-float`.
- Radius: cards `radius-lg`, hero panels and tab bar `radius-xl`, inputs and buttons `radius-md` or `radius-pill`.
- Use the `td-glass`, `td-glass--strong` and `td-solid` classes from `components/bundle.css`.
- Do not nest glass in glass. Do not put text directly on a backdrop glow.
- With reduced transparency, or on low-end Android, fall back to `bg-raised` with no blur and keep the border.

## Backdrops and patterns

- Every page sits on a backdrop: the `bg-top` to `bg-bottom` gradient with `glow-blue` top right and `glow-orange` bottom left (class `td-page`). Full-bleed images are in `assets/Backgrounds/`.
- Three repeating patterns in `assets/Patterns/`: **chevron** (the logo's nested chevrons; website heroes and splash), **rings** (location pings; map, tracking and recovery screens), **dots** (quiet grid; forms and settings). Use one per screen, `-dark` files on Night and `-light` files on Day.

## Layout and spacing

- Spacing steps are `space-1` to `space-16` (4px to 64px). Page gutter on phones is `space-4`; gap between cards is `space-6`; card padding is `space-4` on phones and `space-5` on desktop.
- Phones: one column, full-width buttons, tab bar floating `space-4` above the safe area. Website: 12-column grid, content width 1120px, hero uses `display-xl` on the chevron pattern.

## Motion

- Durations: 160ms for press and hover, 240ms for state changes, 420ms for entrances. Easing is `cubic-bezier(.2,.8,.2,1)`.
- Press scales to 98%; hover lifts 1px. Screens fade and rise 12px. Use skeleton shapes for waits under 800ms and the `LoadingScreen` for cold start and anything longer.
- Honour `prefers-reduced-motion`: keep layout and meaning, stop movement.

## Iconography

Lucide line icons only: 24px grid, `strokeWidth` 1.75, round caps, `currentColor` (`lucide-react` on the web, `lucide-react-native` in the app). Sizes 16, 20 or 24px. No filled icons, no emoji. See the `Icon` preview for the set in use.

## Logo and app icon

- The full lockup is `assets/Logo/logo-full.png`, the supplied master. Never redraw, recolour, stretch or add effects to it. Keep clear space equal to the height of the "T" on all sides, and a minimum width of 120px.
- The mark on its own (`logo-mark.svg`) is the four chevrons with the wordmark's gap closed. Use `logo-mark-on-dark.svg` on navy and Night grounds, `logo-mark-white.svg` for single-colour white, `logo-mark-navy.svg` for single-colour navy.
- The app icon is the mark on a navy gradient. Wire the files in `assets/App icon/` and `assets/Splash/` into the Expo config:

```json
{
  "expo": {
    "icon": "./assets/app-icon-ios-1024.png",
    "splash": { "image": "./assets/splash-1284x2778.png", "resizeMode": "cover", "backgroundColor": "#0B1622" },
    "android": { "adaptiveIcon": {
      "foregroundImage": "./assets/app-icon-android-foreground-1024.png",
      "backgroundImage": "./assets/app-icon-android-background-1024.png",
      "monochromeImage": "./assets/app-icon-android-monochrome-1024.png",
      "backgroundColor": "#2C3E52" } },
    "notification": { "icon": "./assets/notification-icon-96.png", "color": "#F5A022" }
  }
}
```

## Accessibility

- Text 4.5:1 (3:1 for text at 24px or larger), control borders and focus ring 3:1, in both themes.
- Never carry meaning by colour alone: status always has an icon and a word.
- Touch targets are at least 48px. Every control shows a visible focus ring.
- Provide a reduced-transparency and reduced-motion path for every glass and animated element.
