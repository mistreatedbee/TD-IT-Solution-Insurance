The floating bottom navigation for the mobile app: four tabs on a strong glass bar. Markup is `td-glass td-glass--strong td-tabbar` containing `td-tab` buttons; mark the current one with `aria-current="page"`.

**You provide:** exactly four tabs, each an icon from the set and a one-word caption: Home, Assets, Alerts, Account.

**Rules**
- The current tab is filled with `action-primary` and uses `on-action-primary`; the others are `ink-muted` on glass.
- Keep it floating 16px above the bottom safe area, centred, and never wider than the screen minus `space-4` on each side.
- Show an unread dot on Alerts with `danger`, plus a count in the accessible label.
- On the website use a top navigation bar instead; this component is for the app.
