A glass card summarising one registered asset: type icon, name, one identifying detail, status badge and a last-seen line.

**You provide:** the asset type (`laptop`, `car`, `smartphone`, `tv` icon), a name, one identifying detail (serial ending or registration), a `StatusBadge`, and one line of last-seen or case information.

**Rules**
- Show only the last four characters of a serial or ID number in lists. Full values belong on the detail screen, behind sign-in.
- The footer line is `body-sm` in `ink-muted`; for an open case it names the next step, not just the state.
- The whole card is one tap target to the asset detail; show the focus ring on the card, not inside it.
- Don't show a map thumbnail in the list. Location appears on the detail screen and only while location sharing is on.
