A small label that states the state of an asset, claim or account. Use `td-badge td-badge--success|danger|warning|info` with one 14px line icon and an upper-case word.

**Status vocabulary:** PROTECTED, TRACKING, PENDING VERIFICATION, LOST, STOLEN, RECOVERED, CLAIM OPEN. Keep to this list so the app and website say the same thing.

**Rules**
- Always icon plus word. Colour alone never carries the status.
- `success` and `danger` differ in lightness by design, so they stay distinct for colour-blind users. Do not swap in a plain red and green.
- Text colour is the matching status token on its `-bg` tint; every pair is 5:1 or better in both themes.
- Badges describe a state; they are not buttons. Don't make them tappable.
