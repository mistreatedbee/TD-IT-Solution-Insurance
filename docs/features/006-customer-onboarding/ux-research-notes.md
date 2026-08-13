# Feature 006 — Customer Onboarding UX Research Notes

**Lifecycle stage:** 3 — UX Research  
**Stage owner (A):** `ux-researcher`  
**Status:** Phase 1 journey map for web-first onboarding (evidence-informed; moderated testing pending)

---

## 1. Primary journey (web — `/get-started`)

**Trigger:** Landing hero **Get Started** — customer intent: "I want to protect my assets."

```
Landing hero → Get Started
  → Welcome (value prop, trust)
  → Account type (Individual / Business)
  → Sign up OR Log in
  → Verify email (if pending) — anxiety point; clear resend + "check spam"
  → Choose plan (3 cards, plain language)
  → What to protect? (asset category grid)
  → Asset details (type-specific form, one at a time)
  → Review summary (edit links)
  → Complete (honest next steps: payment coming, app optional)
```

**Emotion curve:** Curiosity → mild friction (signup) → waiting (email) → confidence (plan choice) → effort (asset form) → relief (summary).

---

## 2. Design principles (from client brief + stress context)

- Never feel like paper insurance forms — use progress, short steps, plain language.
- Always answer: *Where am I? What do I need? Why? What next?*
- Under verification/payment pending, show **status chips** not dead ends.
- Mobile app download is **optional** post-onboarding — web completes core loop first.
- Enterprise users need **human handoff** — no false "R???/month" placeholder.

---

## 3. Personas (Phase 1)

| Persona | Context | Onboarding needs |
|---------|---------|------------------|
| **Thabo — individual** | Laptop + phone, Nelspruit | Fast, mobile-friendly web, clear monthly price |
| **Nomsa — small business** | 8 devices, shop equipment | Business account type, may need Enterprise quote |
| **Returning user** | Verified, no policy yet | Skip to plan step after login |

---

## 4. Friction risks & mitigations

| Risk | Mitigation |
|------|------------|
| Email verification drop-off | Resend prominent; persist email in session; link to login after verify |
| Plan confusion | Show device limit + price on card; no jargon |
| Asset form abandonment | Autosave draft in sessionStorage; "Add another" after first success |
| False "you're fully covered" | Review + complete screens state billing not configured |
| Enterprise trap | Contact CTA instead of checkout |

---

## 5. Accessibility

- WCAG 2.1 AA: focus order matches step progress; error summaries at top of step.
- Touch targets ≥44px on asset category grid (reuse `AssetBadge`).
- Verification waiting state must not rely on color alone.

---

## 6. Success metrics (when analytics wired)

- Funnel: Get Started → signup → verified → plan selected → ≥1 asset → review viewed.
- Target Phase 1: identify drop-off step before optimizing copy.

---

## 7. Out of scope for Phase 1 research validation

- Usability test sessions (scheduled post-Brevo email live).
- Mobile-only biometric unlock journey.
- Panicked theft-report journey (Feature recovery Phase 2).
