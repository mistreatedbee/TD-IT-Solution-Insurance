The frosted-glass card that carries most content. Use `td-glass td-card` for a card on a backdrop, add `td-card--selected` for the chosen item, and `td-solid td-card` when the card holds long text or a form.

**You provide:** the content inside, and a backdrop behind it (a `td-page` ground or a pattern). Glass on a flat white page has nothing to blur and looks like a plain card; that is acceptable, but do not nest glass inside glass.

**Rules**
- Fill is `glass-fill`, edge is `glass-border`, shadow is `shadow-glass`, blur is `blur-glass` (`blur-glass-strong` for the tab bar and sheets). Keep all four together.
- Radius is `radius-lg` (24px); hero panels use `radius-xl`.
- Text on glass is `ink` or `ink-muted` only. The night `glass-fill` is a deep navy tint so `ink-muted` stays above 5.6:1 over the brightest backdrop glow.
- When the person has reduced transparency turned on, the card becomes `bg-raised` with no blur.
- On low-end Android, replace the blur with `bg-raised` and keep the border.
