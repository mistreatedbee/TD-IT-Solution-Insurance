The page ground: a vertical gradient from `bg-top` to `bg-bottom` with a blue glow top-right (`glow-blue`) and an orange glow bottom-left (`glow-orange`), plus one of three repeating patterns. Apply it with the `td-page` class.

**Patterns** (all in `assets/Patterns/`, light and dark variants)
- **Chevron** (80px tile): nested chevrons from the logo. Use on the website hero, section dividers and the splash.
- **Rings** (200px tile): concentric location rings. Use on tracking, map and recovery screens.
- **Dots** (24px tile): a quiet grid. Use behind forms, tables and settings.

**Rules**
- Use one pattern per screen, at the supplied opacity. Do not stack patterns.
- Use `-dark` variants on the night theme and `-light` on the day theme.
- For a full-bleed hero or phone background, use the prepared images in `assets/Backgrounds/` instead of rebuilding the gradient.
- Backdrops are decoration. Put text on a `td-glass` or `td-solid` surface, never straight on a glow.
