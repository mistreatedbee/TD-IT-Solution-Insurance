# Security Dashboard — local demo (fictional data)

Local-only, in-browser demo of `/security/*` (ADR-0013). No backend, Supabase, Mongo or Vercel is contacted: demo code (`src/security/demo/`) replaces `window.fetch`, answers API calls from in-memory fake data and refuses every other cross-origin request. It is dev-only (`import.meta.env.DEV`), tree-shaken out of production builds, and `vite build` fails if `VITE_DEMO_MODE=true`.

## Run (owner's laptop)
1. `git pull` (or clone), then `npm ci`.
2. `npm run demo:security` — runs `vite --mode demo`. It creates only `.env.demo.local` (`VITE_DEMO_MODE=true`, `VITE_FEATURE_SECURITY_OPERATOR=true`, gitignored) and overrides the Supabase/API URLs to blank/`demo.invalid`. It never reads or writes `.env.local`.
3. Open http://localhost:5173/security. You are auto signed in as `demo.operator@example.invalid` (no login/MFA).

## 5-minute click-through
Do NOT reload or type URLs mid-demo: state lives in memory and resets on reload. Use in-app links.
1. Home: yellow DEMO banner naming the fictional partner org ("Vukani Recovery") and the fictional demo operator ("Lindiwe Mahlangu, Recovery Operations Manager"), "Security Partner Operator", "N open" on the Case queue card. Note the count (3 open). Click **Go to case queue**.
2. Queue: 9 fictional cases (open / investigating / tracking / recovered / closed) across Johannesburg, Cape Town, Durban, Pretoria, Bloemfontein, Gqeberha, Centurion, Polokwane, Nelspruit — only the first 5 load initially. Click **Load more** at the bottom: the remaining 4 cases load. This is the real cursor-pagination path (`backend/src/lib/pagination.ts`'s `nextCursor`/`hasMore` convention) — the demo deliberately uses a page size of 5 (vs. the backend's default 50) so 9 fictional cases are enough to exercise it; see `src/security/demo/handlers.ts` for why that's an honest shortcut (the real UI never decodes the cursor itself, it only round-trips whatever the server returns).
3. Open **REC-DEMO-1001** (unclaimed, open). Click **Claim case**: status becomes investigating; asset and org appear.
4. Click **Begin tracking**, then **Mark recovered**, then **Close case**; the status badge changes each time.
5. With the case now **closed**, click any of the still-offered earlier-status buttons (e.g. "Start investigating"): this shows an error banner ("Case status cannot move backward") instead of silently doing nothing — the real forward-only rule, enforced the same way the backend rejects it (409 `CONFLICT`). The button is deliberately still offered; this is real behaviour, not a demo bug (see "Known limitations").
6. Use the sidebar "Case queue" link, then go back to **Home**: "N open" has dropped by one, because claiming REC-DEMO-1001 moved it out of `open` — the count badge is not static, it refetches (once per Home visit, no polling) from the same in-memory state your claim just mutated.
7. Open **REC-DEMO-1009** (Tablet, Nelspruit — freshly "claimed", still `investigating`): its Notes and location fields show "—", distinct from an unclaimed case (whose Asset ID/Notes fields aren't sent by the API at all) and from a case further along (e.g. REC-DEMO-1005/1006 under "tracking") which has both notes and a location timestamp. This exercises every claimed-tier field being present-but-empty vs. populated.
8. Optional, genuinely live: open DevTools → Network → set "Offline" (or toggle your OS network off), then click **Claim case** or any status button on an unclaimed/open case. The UI shows "You're offline. This \[case has not been claimed / status change has not been saved\] — reconnect and try again." before any request is attempted. This works even in demo mode because `useIsOnline()` (`src/lib/useIsOnline.ts`) reads only `navigator.onLine` and the browser's `online`/`offline` events — it never goes through the demo's fetch interception (`src/security/demo/install.ts`), so this one check is not a simulation, it's the real offline-tolerance code path (`docs/features/009-customer-experience-redesign/10-security-dashboard-offline-tolerance.md`) running live. Turn connectivity back on before continuing.
9. Say plainly: the page itself states live GPS map / location history is "not yet connected".

## Real vs fake
| Item | Status |
|---|---|
| UI components, layout, routes, forward-only status flow, cursor pagination ("Load more"), offline pre-check (`navigator.onLine`) | Real code |
| Cases, asset IDs, reference numbers, notes, dates, the cursor's own bytes (opaque row-offset, not the backend's `<timestamp>,<uuid>` encoding — see `handlers.ts`) | Fake, in memory |
| Org "Vukani Asset Protection & Recovery (Pty) Ltd" / "Vukani Recovery" (entirely fictional — see [`demo-security-partner-profile.md`](demo-security-partner-profile.md)), operator `demo.operator@example.invalid` shown as "Lindiwe Mahlangu, Recovery Operations Manager" | Fake |
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
- After a case is closed the UI still offers earlier status buttons; clicking one shows an error (forward-only rule). Real behaviour — now an explicit step in the click-through above, not just a passive fact.
- Fonts load from Google Fonts via static CSS (not an app call); offline falls back to system fonts.
- The dashboard has no notes or police-report actions, so none are demoed.
- The demo's pagination cursor is an opaque row-offset the demo itself invents, not the backend's real `base64(<iso-timestamp>,<uuid>)` encoding (`backend/src/lib/pagination.ts`) — the real `CasesListPage` UI never decodes a cursor either way, so this difference is invisible on screen, but don't claim the cursor *bytes* are real if asked directly.

## After the demo
1. Stop the dev server (Ctrl+C).
2. `npm run demo:security:cleanup` — deletes `.env.demo.local` only and reports stray demo changes. Nothing the demo does persists (in-memory only), so this is the whole cleanup. It never opens `.env.local` or any other env file.
3. Close the browser tab.
4. Confirm production untouched: nothing was deployed and no Vercel/Supabase/Mongo setting or account was changed (the demo needs none).
