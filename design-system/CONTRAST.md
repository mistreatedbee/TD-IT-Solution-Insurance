# Contrast report

Key pairs from the token usage notes, computed by `node design-system/check-contrast.mjs`
(WCAG 2.1 relative luminance; translucent tokens such as `glass-fill` and the `-bg` tints are
composited over `bg-page` of the same theme). Targets: 4.5:1 text, 3:1 control borders and focus ring.
Token values are never altered by this check; a failing pair is reported, not fixed here.

Result at generation: all pairs meet their target. Glows behind `glass-fill` are not modelled
(decorative; the token notes forbid small text on them without glass).

```
PASS  day   ink on bg-page: 14.76 (need 4.5)
PASS  day   ink-muted on bg-page: 6.33 (need 4.5)
PASS  day   ink on glass-fill: 15.99 (need 4.5)
PASS  day   ink-muted on glass-fill: 6.86 (need 4.5)
PASS  day   ink on bg-raised: 16.48 (need 4.5)
PASS  day   ink-muted on bg-raised: 7.07 (need 4.5)
PASS  day   ink on bg-sunken: 13.69 (need 4.5)
PASS  day   ink-muted on bg-sunken: 5.87 (need 4.5)
PASS  day   on-action-primary on action-primary: 7.80 (need 4.5)
PASS  day   on-action-secondary on action-secondary: 5.51 (need 4.5)
PASS  day   on-navy on brand-navy: 10.95 (need 4.5)
PASS  day   link on bg-page: 5.45 (need 4.5)
PASS  day   link on bg-raised: 6.08 (need 4.5)
PASS  day   link on glass-fill: 5.90 (need 4.5)
PASS  day   link on info-bg: 5.00 (need 4.5)
PASS  day   accent-text on bg-page: 5.57 (need 4.5)
PASS  day   accent-text on bg-raised: 6.22 (need 4.5)
PASS  day   accent-text on glass-fill: 6.04 (need 4.5)
PASS  day   success on bg-page: 5.40 (need 4.5)
PASS  day   success on success-bg: 5.14 (need 4.5)
PASS  day   danger on bg-page: 5.86 (need 4.5)
PASS  day   danger on danger-bg: 5.38 (need 4.5)
PASS  day   warning on bg-page: 5.57 (need 4.5)
PASS  day   warning on warning-bg: 5.30 (need 4.5)
PASS  day   border-control on bg-page: 3.84 (need 3)
PASS  day   border-control on bg-raised: 4.28 (need 3)
PASS  day   border-control on glass-fill: 4.15 (need 3)
PASS  day   focus-ring on bg-page: 5.45 (need 3)
PASS  day   focus-ring on bg-raised: 6.08 (need 3)
PASS  day   focus-ring on glass-fill: 5.90 (need 3)
PASS  night ink on bg-page: 16.79 (need 4.5)
PASS  night ink-muted on bg-page: 9.34 (need 4.5)
PASS  night ink on glass-fill: 15.12 (need 4.5)
PASS  night ink-muted on glass-fill: 8.41 (need 4.5)
PASS  night ink on bg-raised: 14.27 (need 4.5)
PASS  night ink-muted on bg-raised: 7.94 (need 4.5)
PASS  night ink on bg-sunken: 15.69 (need 4.5)
PASS  night ink-muted on bg-sunken: 8.73 (need 4.5)
PASS  night on-action-primary on action-primary: 7.80 (need 4.5)
PASS  night on-action-secondary on action-secondary: 7.49 (need 4.5)
PASS  night on-navy on brand-navy: 10.95 (need 4.5)
PASS  night link on bg-page: 9.25 (need 4.5)
PASS  night link on bg-raised: 7.86 (need 4.5)
PASS  night link on glass-fill: 8.33 (need 4.5)
PASS  night link on info-bg: 6.75 (need 4.5)
PASS  night accent-text on bg-page: 8.62 (need 4.5)
PASS  night accent-text on bg-raised: 7.33 (need 4.5)
PASS  night accent-text on glass-fill: 7.77 (need 4.5)
PASS  night success on bg-page: 8.78 (need 4.5)
PASS  night success on success-bg: 6.51 (need 4.5)
PASS  night danger on bg-page: 7.98 (need 4.5)
PASS  night danger on danger-bg: 6.16 (need 4.5)
PASS  night warning on bg-page: 8.62 (need 4.5)
PASS  night warning on warning-bg: 6.29 (need 4.5)
PASS  night border-control on bg-page: 7.03 (need 3)
PASS  night border-control on bg-raised: 5.98 (need 3)
PASS  night border-control on glass-fill: 6.33 (need 3)
PASS  night focus-ring on bg-page: 8.62 (need 3)
PASS  night focus-ring on bg-raised: 7.33 (need 3)
PASS  night focus-ring on glass-fill: 7.77 (need 3)

All pairs meet target
```
