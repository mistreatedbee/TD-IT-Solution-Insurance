A pill-shaped action in four variants. Use `td-btn td-btn--primary` for the one main action on a screen, `td-btn--secondary` for the next most important, `td-btn--glass` for cancel or back, and `td-btn--danger` only for reporting a loss or deleting.

**You provide:** a visible text label of one to three words (verb first, sentence case) and optionally one 20px line icon before it.

**Do**
- Put at most one `td-btn--primary` on a screen. Its text uses `on-action-primary`, never white.
- Keep the minimum height of 48px; stack full-width on phones.
- Show the focus ring (`focus-ring`, 2px, 2px offset) on every button; do not remove it.

**Don't**
- Don't put the orange primary on an orange or amber ground.
- Don't set white text on `brand-orange`; it fails contrast. Use `on-action-primary`.
- Don't rely on `disabled` to explain an error; say what is missing next to the button.
