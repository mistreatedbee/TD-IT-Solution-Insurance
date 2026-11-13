The full-screen launch and loading state: the logo mark assembles from two halves, location-style rings ping outward, and a thin orange bar slides underneath. It always sits on the night ground.

**You provide:** nothing but a container with a fixed size (or `position:fixed; inset:0` for the real screen) holding the markup in the preview. Replace the card radius with `0` when it fills the screen.

**Rules**
- Show it for cold start and for any wait over 800ms; for shorter waits use skeleton shapes instead.
- Never add text to it. If loading fails, replace it with an error screen that names the problem and offers a retry.
- Respect reduced motion: the mark and bar stay, the animations stop, the rings are hidden.
- The still version for the operating system's launch image is `assets/Splash/splash-1284x2778.png`.
