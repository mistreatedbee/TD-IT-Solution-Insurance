# ADR-0003: Backend Hosting Platform — Move to a Persistent-Process Host

Status: Accepted
Date: 2026-08-07
Deciders: `cloud-infrastructure-architect` (proposing), `backend-architect` (consulted), ratified 2026-08-07 by `cto` (platform owner)

## Context

ADR-0001 left hosting provider explicitly open. Since then, `backend/` (Node.js/TypeScript/Express) was deployed to Vercel as a second "service" alongside the frontend via `vercel.json`'s `services` block, and it works: `/`, `/api/health`, `/api/health/ready` all return 200 at https://td-it-solution-insurance-alpha.vercel.app/, and MongoDB Atlas connects. Getting there required two non-obvious fixes (an explicit `entrypoint` field, and a service-scoped SPA-fallback rewrite for the frontend) — both signs the platform is being bent to fit a serverless-Functions execution model it wasn't designed for.

The backend's actual architecture assumes a **persistent process**, not a Function:

- `backend/src/db/mongodb.ts` implements a `MongoClient` singleton explicitly built on "create once, reuse for the lifetime of the process" — the driver's recommended pattern, which depends on there being one long-lived process.
- `backend/src/index.ts` implements graceful `SIGTERM`/`SIGINT` shutdown that closes the Mongo connection cleanly before exit — a pattern that only pays off when the host actually sends `SIGTERM` before killing the process and waits for exit.

On Vercel, the backend runs as a Node serverless Function. Vercel's Fluid compute keeps functions warm across invocations, which is why connection reuse *appears* to work today — but warm-reuse is a best-effort optimization of the platform, not a contract. There is no guaranteed `SIGTERM`-before-kill semantics the way a real process host provides, and nothing stops Vercel from cold-starting a fresh instance (fresh `MongoClient`, fresh connection-pool ramp-up) under scale-to-zero, traffic shifts, or redeploys. The code and the host are architecturally mismatched: we wrote a persistent-process app and are running it on a platform that doesn't promise persistence.

The platform owner asked directly: "i should host my backend on Render.com right?" This ADR answers that, on the merits, not as a rubber stamp.

## Decision

**Move the backend off Vercel to a persistent-process host. Render is the recommended default.**

Reasoning:

1. **Architecture fit.** The backend is already written as a long-running Express server with connection-lifecycle and signal-handling code that only does what it's designed to do on a host that runs one process continuously. Render (and equivalents — Railway, Fly.io) run exactly that: a container/VM executing `npm start` continuously, receiving real `SIGTERM` on deploys/restarts, with a connection pool that actually persists for "process lifetime" as the code assumes. No code changes are required to get correct behavior — that's the strongest signal this is the right move, not a preference call.
2. **Removes a false economy.** The two workarounds already needed (explicit `entrypoint`, scoped rewrite) are cost being paid *today* to keep this mismatch working, and it's early — this is exactly the moment to correct architecture/host mismatch before more routes, more state (rate-limiting counters, in-memory caches), or Feature 001's session/auth logic get built on an assumption (process persistence) the current host doesn't guarantee.
3. **Why Render specifically, not Railway or Fly.io:** Render, Railway, and Fly.io are all reasonable persistent-process hosts for this stage — I do not consider this a close call requiring a bake-off. Render is the concrete recommendation because: it's the platform owner's own instinct (no reason to override a sound default with an artificial alternative), it has the simplest path from "GitHub repo" to "running service with health checks and auto-deploy" of the three, native cron/background-worker primitives exist on the same platform if a GPS-ingestion worker needs one later, and it has a real free/cheap tier suitable for this stage's traffic. If cost or region-coverage needs change materially as GPS ingestion scales (see ADR-0001's note that `cloud-infrastructure-architect` owns a full hosting evaluation before Phase 2 ingestion work), that's a separate, larger hosting-provider ADR — this decision is scoped narrowly to "where does the current Express backend run today," not the platform's long-term cloud strategy.
4. **Frontend stays on Vercel.** Nothing about the frontend's fit with Vercel is in question — Vite/React static/SPA hosting is exactly what Vercel is good at. This ADR does not reopen that.

This is a small, fast, low-risk call appropriate to the platform's current stage — not the full multi-criteria hosting evaluation (managed MongoDB compatibility, GPS-ingestion autoscaling primitives, compliance certs, multi-region) that ADR-0001 flagged as a future `cloud-infrastructure-architect` deliverable. That larger evaluation still happens before Phase 2 GPS-ingestion infrastructure is built; this ADR just gets the backend off a mismatched host now.

### Consequence to address immediately: frontend and backend on different domains

Moving the backend means frontend (`*.vercel.app`, later a custom domain) and backend (`*.onrender.com`, or equivalent) are no longer same-origin. Three concrete changes:

**1. CORS.** `backend/src/index.ts` currently calls `app.use(cors())` with no options — permissive/reflects-all-origins default. Once the frontend calls the backend cross-origin, lock this down explicitly:

```ts
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  credentials: true, // required once auth uses cookies/session (Feature 001)
}));
```

Set `CORS_ALLOWED_ORIGINS` per environment (e.g. `https://td-it-solution-insurance-alpha.vercel.app` in production, plus any preview-deploy pattern the frontend uses, plus `http://localhost:5173` for local dev). Do not leave this as bare `cors()` once a real cross-origin frontend depends on it — that's an open door, not a configuration.

**2. Custom domain: not urgent, but plan for it.** A unified domain (e.g. `app.tditsolutions.com` for the frontend, `api.tditsolutions.com` for the backend, both under one apex) is worth doing once a real domain is purchased — it removes CORS complexity for cookie-based auth edge cases and reads better publicly. It is **not** a blocker for this migration; `*.onrender.com` + explicit CORS origin config works correctly today. Revisit when Feature 001's session/cookie design lands (cross-subdomain cookies are simpler than cross-site cookies) or when a production domain is purchased — whichever comes first.

**3. `vercel.json` changes.** Drop the multi-service config entirely and go back to a single-service (frontend-only) Vercel project:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The `services.backend` block and the `/api(/.*)?` → backend-service rewrite are removed — there's no backend service on Vercel anymore. The frontend needs the backend's public URL wired in as a build-time environment variable (e.g. `VITE_API_BASE_URL=https://<service>.onrender.com`), consumed wherever the frontend makes API calls, instead of assuming same-origin `/api/*`.

**Checked `src/lib/waitlistApi.ts` for this assumption:** it is currently a deliberate stub (`submitToWaitlist()` always throws `WaitlistNotConnectedError` — no network call exists yet, per its own header comment and `business-requirements.md` §8/§12.3.6, which leave the storage/vendor choice and a POPIA compliance review as unresolved prerequisites). It does **not** currently assume a same-origin `/api/*` path because it doesn't call anything yet. Flagging for whoever wires it up: when a real endpoint is implemented, it must call `${VITE_API_BASE_URL}/api/...`, not a relative `/api/...` path — a relative path would silently 404 against the frontend's own Vercel origin now that the backend lives elsewhere. No other frontend code currently calls the backend (Feature 001's auth endpoints aren't implemented yet either), so this is the one call site to get right when real API integration begins.

## Alternatives Considered

- **Stay on Vercel Functions, adapt the code to be stateless-per-invocation** (open a Mongo connection per request or use a connection-caching pattern scoped to the function's module, drop the SIGTERM-based shutdown entirely). Rejected: this throws away correct, already-written code to accommodate a host, rather than choosing a host that fits the code. It also doesn't fully solve the problem — Vercel Functions still have execution-time limits and no true persistent background capability, which matters more as GPS-ingestion workers or queue consumers are added later (ADR-0001's noted future ingestion-autoscaling work). Optimizing further into "Vercel-shaped" code now is effort spent making the wrong platform work harder, when the simpler fix is picking the platform that already matches the code.
- **Railway or Fly.io instead of Render.** Both are legitimate persistent-process hosts, functionally comparable to Render for this stage (container-based, real signal handling, simple GitHub-based deploy). Not rejected on technical grounds — genuinely a coin-flip between the three today. Render is named as the concrete pick because the platform owner already gravitated to it and there's no material reason to introduce a different default; this does not preclude revisiting the choice during the fuller hosting-provider evaluation ADR-0001 scoped for `cloud-infrastructure-architect` ahead of Phase 2 GPS-ingestion buildout.
- **Do nothing / keep multi-service Vercel as-is.** Rejected: the two workarounds already required to keep it running are early warning signs, and the architecture/host mismatch (no guaranteed graceful shutdown, connection-reuse as a best-effort optimization rather than a guarantee) is a correctness risk on data paths (claims, policy writes, eventually GPS pings) the platform can't afford to leave to chance once real traffic exists.

## Migration Checklist

1. **Create the Render account/service.** Sign up (or use existing account), create a new **Web Service**, connect it to this repo, root directory `backend/`.
2. **Build/start commands** (map directly from `backend/package.json`, no script changes needed):
   - Build command: `npm install --include=dev && npm run build` (runs `tsc -p tsconfig.json`, emitting `dist/`) — **must** be `--include=dev`, not plain `npm install`: with `NODE_ENV=production` set (step 3 below), a bare install skips `devDependencies`, silently dropping `typescript`/`@types/node`/`@types/express`/`@types/cors` and breaking the build with misleading "Cannot find name 'process'"-style errors. Confirmed empirically during this migration, not theoretical.
   - Start command: `npm start` (runs `node dist/index.js`)
3. **Environment variables to carry over from Vercel/`.env.local`:**
   - `MONGODB_URI` — copy from the current Vercel project env config (or repo-root `.env.local`) into Render's environment settings. Do not commit it.
   - `SUPABASE_DB_URL` — carry over if/when it's populated (currently unset per ADR-0002; not a blocker).
   - `PORT` — Render sets this itself and expects the app to bind to `process.env.PORT`; `backend/src/config/env.ts` already reads `PORT` with a fallback, so no code change needed — just don't hardcode a port value in Render's config.
   - `NODE_ENV=production`.
   - `CORS_ALLOWED_ORIGINS` — new variable, set per this ADR's CORS section above, once the `cors()` call is updated.
4. **Update `backend/src/index.ts`'s `cors()` call** per the CORS section above, before or immediately after the Render cutover (leaving it wide-open past this point is not acceptable once cross-origin is real, not incidental).
5. **Verify health checks against the new host:** `GET https://<service>.onrender.com/api/health` and `/api/health/ready` both return 200 with a working `MONGODB_URI` before calling the migration done. Confirm `MongoClient` connects cleanly on Render's environment (no Atlas IP allowlist issue — Render's egress IPs differ from Vercel's; add Render's IP or use Atlas's "allow from anywhere" only if already accepted under the current setup).
6. **Update `vercel.json`** to the single-service frontend-only form shown above; remove the `services` block and the `/api(/.*)?` rewrite.
7. **Add `VITE_API_BASE_URL`** (or equivalent) to the Vercel frontend project's environment variables, pointing at the Render service URL; wire it into whatever HTTP client the frontend uses for backend calls (there are none live yet — `waitlistApi.ts` is a stub — so this is prep for when Feature 001's frontend integration begins, not a fix to an existing broken call).
8. **Redeploy both**: Render (backend) first, confirm health checks green, then Vercel (frontend) with the updated `vercel.json` and `VITE_API_BASE_URL`.
9. **Decommission the old backend path on Vercel** — once Render is confirmed serving traffic, there's nothing backend-specific left in the Vercel project; the `entrypoint` workaround and service-scoped rewrite that were needed for the multi-service setup are no longer relevant and should not be reintroduced.
10. **Update `backend/README.md`** to reference Render as the deploy target instead of (or in addition to) any Vercel-specific instructions, so future engineers aren't misled about where this actually runs.

## Consequences

- Backend code's existing assumptions (persistent `MongoClient`, real `SIGTERM`-based graceful shutdown) become **actually true** guarantees of the hosting environment, not lucky accidents of Vercel's warm-function behavior. This removes a real correctness risk on the data paths that matter most (policy/claims writes now, GPS-ping ingestion later).
- Frontend and backend become genuinely separate deployables with separate domains — CORS must be explicitly configured (no longer optional/implicit via same-origin), and any frontend code calling the backend must use an explicit base-URL env var rather than assuming a relative `/api/*` path.
- Two hosting relationships to manage instead of one (Vercel for frontend, Render for backend) — a minor operational overhead, accepted because it removes a structural risk, not because it's free.
- This does not resolve the platform's full hosting-provider question (multi-criteria evaluation covering managed MongoDB compatibility, GPS-ingestion autoscaling, region coverage, compliance) — that remains a distinct, larger `cloud-infrastructure-architect` deliverable scoped in ADR-0001, still open, still to be done before Phase 2 ingestion work depends on it.

## What Does NOT Change

- **MongoDB Atlas** (ADR-0001) is unaffected — same cluster, same connection string, just called from a process running on a different host.
- **Supabase** (ADR-0002) is unaffected — this ADR is entirely about where the Node/Express process that talks to Mongo (and eventually Supabase) executes, not about the data layer itself.
- Backend application code is unaffected except the single `cors()` configuration change described above — the persistent-process architecture in `backend/src/index.ts` and `backend/src/db/mongodb.ts` was already correct; it just needed a host that honors it.

## Revisit Trigger

Reopen this ADR if: Render's free/starter tier can't sustain real traffic or GPS-ingestion load once Phase 2 begins (triggers the fuller multi-provider hosting evaluation already scoped to `cloud-infrastructure-architect` in ADR-0001, not a re-litigation of this decision); region-latency requirements emerge that Render can't meet for GPS data; or a custom-domain / cross-subdomain cookie requirement from Feature 001's session design makes a specific alternate topology (e.g. same-apex subdomains) worth doing sooner than "later."

---

## Appendix A — POPIA s72 compliance addendum: `region: frankfurt` is a cross-border transfer decision, not only an architecture-fit one

**Added:** 2026-09-14, by `cloud-infrastructure-architect`, discharging **CT-8** in
[`docs/organization/10-data-protection-contract-obligations.md`](../10-data-protection-contract-obligations.md)
(deadline 2026-09-12, closed late). Appended per the ADR-0006/ADR-0009 precedent of amending by
appendix rather than rewriting an Accepted decision. Nothing above this line is changed or
withdrawn by what follows — the hosting decision stands; what was missing is the compliance
analysis that should have accompanied it.

### A.1 What this appendix corrects

The body of this ADR (§"Decision", §"Why Render specifically") selected Render, and
`render.yaml:9` sets `region: frankfurt`, on **architecture-fit and operational grounds only** —
persistent-process semantics, deploy simplicity, cost, the platform owner's own instinct. The word
"region" appears in the ADR's own future-work list ("region coverage") as a **deferred evaluation
item**, and nowhere else. **No POPIA analysis, no cross-border-transfer analysis, and no data-location
finding of any kind was performed before `region: frankfurt` was set and shipped to production.**

That is the finding CT-8 exists to record: **placing the backend API — the system that receives,
processes and returns every customer's personal information — in Frankfurt, Germany was, in
substance, a decision to transfer personal information about South African data subjects outside
the Republic.** It was made as though it were purely a technical placement choice. It was not. Every
API request carrying customer PII (account data, policy data, asset data, and — once Feature
008/009 hardware integration lands — location data) is processed on German soil as a direct
consequence of this ADR's `region:` field. That consequence should have triggered the same
transborder-transfer analysis Feature 001 performed for Supabase, at the same time this ADR was
written (2026-08-07). It did not, until now, five weeks later.

This appendix does not reverse the decision — §A.4 explains why Frankfurt is in practice the only
available choice — but it supplies the compliance analysis that should have gated it, and it
records that gap so it is not repeated for the next infrastructure placement decision.

### A.2 POPIA s72(1)(a) legal-basis analysis for Render Frankfurt

Applying the same method already established this session for the platform's other cross-border
stores — [`compliance-review-supabase.md`](../../features/001-authentication/compliance-review-supabase.md)
§4.3, and the equivalent test run for the email operator at
[`compliance-review-resend.md`](../../features/001-authentication/compliance-review-resend.md)
§5.3 — to the Render backend specifically, rather than reasoning from Supabase's ruling by analogy.

| Ground | Available for Render? | Ruling |
|---|---|---|
| **s72(1)(a)** — recipient subject to a law, binding corporate rules, or **binding agreement** providing an adequate level of protection, upholding (i) substantially similar processing principles and (ii) substantially similar onward-transfer provisions | **Basis exists in principle, but is contractually unverified for Render specifically.** Render publishes a standard Terms of Service and a Data Processing Addendum for customers processing personal information through its services; Render's infrastructure runs on top of major cloud substrate (its own hosting stack), analogous in structure to Supabase's AWS-backed model. **No one has yet executed, or even requested, Render's DPA, and no one has read it against the s72(1)(a)(i)/(ii) tests the way `compliance-review-supabase.md` §4.3/§5.1 did for Supabase.** This is the load-bearing gap: the *statutory route* to lawfulness is the same binding-agreement route already proven to work for Supabase, but the *specific instrument* has not been obtained, read, or executed for Render. |
| **s72(1)(b)** — data subject consent | Available in principle for customer data subjects. | **Not the basis relied on**, for the same reasons `compliance-review-supabase.md` §4.3.1 rejected it for Supabase: the account/API cannot function without the backend that processes it, so consent to that processing would not be freely given, and Stage 1 §9.2's contract-necessity framing already governs this data. Do not introduce a "consent to backend hosting location" checkbox — it would fail for the identical reasons already ruled on. |
| **s72(1)(c)** — necessary for performance of a contract with the data subject | **Yes, for customer data subjects.** The backend API is not an optional processing path — it *is* the mechanism by which the policy/asset service the customer contracted for is delivered. Directly analogous to `compliance-review-supabase.md` §4.3's s72(1)(c) finding for Supabase. | **SUPPORTING basis**, same scope limitation as Supabase's ruling: not available for processing that has no data-subject contract behind it (e.g., any future security-company-operator or admin-only processing routed through this same backend). |
| **s72(1)(d)/(e)** | Not applicable. | Not relied on, consistent with the Supabase and Resend rulings. |

**Ruling, provisional and narrower than Supabase's: the Frankfurt transfer is *probably* lawful under
s72(1)(a), on the strength of the same binding-agreement route already validated for Supabase's
structurally similar EU hosting arrangement, supported for customer data subjects by s72(1)(c) — but
this is not yet a closed finding the way Supabase's is.** The difference from Supabase's "COMPLIANT
WITH CONDITIONS" ruling is material: Supabase's s72(1)(a) basis was tested against an actually-read
DPA and an actually-read sub-processor list (§5.1). **Render's has not been tested at all — no DPA has
been requested, read, or executed, and no sub-processor list has been obtained.** Until that work is
done, this appendix records a **reasoned expectation of lawfulness by structural analogy, not a
verified finding**. The verification work — obtain and execute Render's DPA, read it against the
s72(1)(a)(i)/(ii) tests exactly as `compliance-review-supabase.md` §4–§5 did for Supabase, obtain and
triage Render's sub-processor chain — is **not scoped to CT-8** and is recorded as a new open item
for `compliance-specialist`: **CT-13**, tracked in the register (§A.6 below), separate from and
in addition to CT-1's Client-consent requirement, which is a §19(c) contractual-consent question
and answers a different test than this s72 statutory one (see `10-data-protection-contract-obligations.md`
§2(a) for why the two must not be conflated).

### A.3 Cross-reference to CT-1's current status

CT-1 governs the **Client's contractual §19(c) consent** to cross-border processing, of which the
Render/Frankfurt transfer is one itemised component (item 1 of the schedule referenced at
`10-data-protection-contract-obligations.md` §9.5/§10). As of this appendix's authorship
(2026-09-14), CT-1's own register records its status, **quoted exactly, not paraphrased or
summarised from memory**, at `10-data-protection-contract-obligations.md` §10.5:

> **CT-1** | **Superseded state — see §10.3. Sent 2026-09-14; informally acknowledged ("its fine");
> consent not confirmed in the required form.** No objection or condition received. Containment
> (§9.3) remains operative | **Owner** (send CT-1a) + `compliance-specialist` (rule on the reply) |
> Reply requested **2026-09-17**

That is: the Client has been told, in writing, that Render Frankfurt is one of the processing
locations (per the schedule at §9.4/§10.1), and has responded with an informal, non-binding
acknowledgement that `compliance-specialist` has ruled (§10.2) does **not** satisfy §19(c)'s
requirement for specific, scoped, authority-evidenced written consent. **CT-1 is not closed.** The
standing containment condition — no real customer personal information on any surface until CT-1
closes in the required form — remains operative and is not altered by this appendix. This appendix
does not, and per the task framing need not, wait on CT-1 to close: it is scoped to the s72
statutory analysis and the ADR's own documentation gap, not to the separate §19(c) contractual
consent question, which CT-1 continues to own.

### A.4 Why Frankfurt — the localisation question is not being re-litigated here

Per `10-data-protection-contract-obligations.md` §9.1, already checked on the evidence and not
reopened by this appendix: **Render's entire region set is Oregon, Ohio, Virginia, Frankfurt, and
Singapore — no African region exists on Render.** Data localisation in South Africa is therefore
**impossible** on Render, on identical structural footing to Supabase's own no-African-region
constraint (`compliance-review-supabase.md` finding 1, §0). Frankfurt is, among Render's available
regions, the one already selected for the reasons this ADR's body gives (and incidentally the
lowest-latency non-US option for a South African client base, though that was not the stated
rationale at the time). Localising would require abandoning Render entirely — reversing this ADR
and re-running a full host selection — for a cost `10-data-protection-contract-obligations.md` §9.1
already assessed as "grotesquely out of proportion" for the identity-store case and no less
disproportionate here. **This appendix does not propose relocating the backend.** The question of
*whether* to be in a foreign region is closed by constraint, not by preference; what remained open,
and what this appendix closes, is the compliance analysis of the region actually available.

### A.5 Standing requirement: future hosting-region changes require compliance-specialist counter-sign

**Effective immediately, on the same standing as the Supabase EU-region rule at
`compliance-review-supabase.md` §3.3:** any future change to `render.yaml`'s `region:` field, any
migration to a different hosting provider under this ADR's Revisit Trigger, or any new backend
service deployed to a region not already covered by this appendix, requires `compliance-specialist`
counter-sign **before** the change ships to production — not as a retrospective document, as
happened with the original `region: frankfurt` placement. This closes the gap CT-8 exists to record:
a region/host placement decision is a data-location decision with POPIA consequences, and it must be
reviewed as one at decision time, not reconstructed after the fact.

### A.6 Register update

Discharges **CT-8** (`10-data-protection-contract-obligations.md` §6, deadline 2026-09-12, closed
late 2026-09-14). Opens **CT-13**: obtain and execute Render's DPA (if one exists as a standard
customer-facing instrument; if not, escalate the gap to `cto`) and run the same s72(1)(a)(i)/(ii)
analysis against it that `compliance-review-supabase.md` §4–§5 ran for Supabase, including obtaining
and triaging Render's sub-processor chain. Owner `compliance-specialist`, with `cloud-infrastructure-architect`
supplying the vendor contact/account-tier context needed to request the DPA. No deadline set in this
appendix — `compliance-specialist` to set one when the register entry is filed, consistent with how
every other CT item in that register carries an explicit date.
