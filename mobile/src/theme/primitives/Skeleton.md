# Skeleton (mobile)

OB-17 glass redesign — genuinely-new RN primitive. Shimmer loading placeholder, replacing bare
`ActivityIndicator` spinners for page/list content loading states, per
`docs/organization/design-system/ob-17-glass-redesign-tokens.md` §6.

## Usage

```tsx
import { Skeleton, SkeletonRow } from '../../theme/primitives';

if (isLoading && !data) {
  return (
    <>
      <Skeleton width="60%" height={28} radius={8} />
      <SkeletonRow />
      <SkeletonRow />
    </>
  );
}
```

## Props (`Skeleton`)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `width` | `number \| \`${number}%\`` | `'100%'` | Bar/block width. |
| `height` | `number` | `16` | Bar/block height. |
| `radius` | `number` | `8` | Corner radius — pass a card radius token (`radius.glassCard`) for card-shaped placeholders. |
| `style` | `StyleProp<ViewStyle>` | – | Extra style, e.g. margin between stacked bars. |

`SkeletonRow` composes an avatar-circle `Skeleton` + two text-line `Skeleton`s to match a typical
list-row geometry (icon + title + subtitle) in one call.

## Notes

- Visual only — does not fetch, cache, or gate data. Callers keep their existing `isLoading`
  branch and swap spinner markup for `Skeleton` shapes matching the content being replaced, so
  layout doesn't jump on resolve (tokens doc §6).
- Shimmer uses `Animated` opacity pulse (not a translate-based shimmer sweep) at
  `glassMotion.skeletonShimmerDurationMs` (1200ms) — cheap on low-end devices, `useNativeDriver`.
- Marked `accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"` — it's a
  placeholder, not content; screen readers should skip it.
- The map screen's loading placeholder (screens doc §5.1) is a solid muted block, not a
  shimmer-bar stand-in for text — flagged in the screens doc as needing its own
  `design-system-manager` sign-off on whether that's "the same component with a prop" vs. a
  second primitive; this build uses a single plain `Skeleton` block (no shimmer-bar geometry) for
  that one case rather than inventing a second component, pending that sign-off.
