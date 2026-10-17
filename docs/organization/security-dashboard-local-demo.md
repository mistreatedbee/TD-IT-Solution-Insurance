# Security Dashboard — local demo (fictional data)

Local-only, in-browser demo of `/security/*` (ADR-0013). No backend, Supabase, Mongo or Vercel is contacted: demo code (`src/security/demo/`) replaces `window.fetch`, answers API calls from in-memory fake data and refuses every other cross-origin request. It is dev-only (`import.meta.env.DEV`), tree-shaken out of production builds, and `vite build` fails if `VITE_DEMO_MODE=true`.

## Run (owner's laptop)
1. `git pull` (or clone), then `npm ci`.
2. `npm run demo:security` — runs `vite --mode demo`. It creates only `.env.demo.local` (`VITE_DEMO_MODE=true`, `VITE_FEATURE_SECURITY_OPERATOR=true`, gitignored) and overrides the Supabase/API URLs to blank/`demo.invalid`. It never reads or writes `.env.local`.
3. Open http://localhost:5173/security. You are auto signed in as `demo.operator@example.invalid` (no login/MFA).

## 5-minute click-through
Do NOT reload or type URLs mid-demo: state lives in memory and resets on reload. Use in-app links.
1. Home: yellow DEMO banner, "Security Partner Operator", "N open" on the Case queue card. Click **Go to case queue**.
2. Queue: 8 fictional cases (open / investigating / tracking / recovered / closed) across Johannesburg, Cape Town, Durban, Pretoria, etc.
3. Open **REC-DEMO-1001** (unclaimed, open). Click **Claim case**: status becomes investigating; asset and org appear.
4. Click **Begin tracking**, then **Mark recovered**, then **Close case**; the status badge changes each time.
5. Use the sidebar "Case queue" link: the case shows its new status.
6. Say plainly: the page itself states live GPS map / location history is "not yet connected".

## Real vs fake
| Item | Status |
|---|---|
| UI components, layout, routes, forward-only status flow | Real code |
| Cases, asset IDs, reference numbers, notes, dates | Fake, in memory |
| Org "DEMO – Fictional Security Partner (not a live integration)", operator `demo.operator@example.invalid` | Fake |
| Sign-in, MFA, session | Faked in demo only; real auth code untouched |
| Server-side audit logging, rate limiting, partner-org scoping | Not exercised (no server) |
| Live GPS, partner integration, dispatch | Not built |

## Do NOT say or claim
- The product is pre-launch and the partner organisation is fictional (ADR-0013 talk-track rule).
- No live partner integration exists; the dispatch model is undecided (G-7); partner registry (PDM-6) is not built.
- Not production-ready for real customer data (Stage 8 for this surface is CONDITIONAL, not clearance).
- Do not say GPS tracking feeds this screen or that recovery is "real time".
- Do not enable this on Vercel/production or create demo accounts there.

## Known limitations
- Full page reload resets all state (by design); typing a URL counts as a reload.
- Unclaimed rows show **"undefine…"** in the queue's Asset column and "undefined" as Asset ID on detail: the real UI assumes `assetId` exists but the real API omits it for unclaimed cases. Real bug, not fixed here; don't dwell on that column.
- After a case is closed the UI still offers earlier status buttons; clicking one shows an error (forward-only rule). Real behaviour.
- Fonts load from Google Fonts via static CSS (not an app call); offline falls back to system fonts.
- The dashboard has no notes or police-report actions, so none are demoed.

## After the demo
1. Stop the dev server (Ctrl+C).
2. `npm run demo:security:cleanup` — deletes `.env.demo.local` only and reports stray demo changes. Nothing the demo does persists (in-memory only), so this is the whole cleanup. It never opens `.env.local` or any other env file.
3. Close the browser tab.
4. Confirm production untouched: nothing was deployed and no Vercel/Supabase/Mongo setting or account was changed (the demo needs none).
