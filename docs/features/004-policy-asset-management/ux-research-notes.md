# Feature 004 — UX Research Notes (M-03 + asset registration)

**Lifecycle stage:** 3 — UX Research (minimum viable, not full study)  
**Owner:** `ux-researcher`  
**Status:** Phase 1 guidance for `ui-designer` / `mobile-engineer`  
**Related:** [`ui-design.md`](./ui-design.md), [`business-requirements.md`](./business-requirements.md)

---

## M-03 Home screen

**Finding:** Customers landing after login need orientation without fake data. Summary cards with **live counts** (policy + assets) and links to tabs reduce navigation hunting without implying coverage is active.

**Recommendation (implemented):** Welcome + email; verification banner for `pending_verification`; two cards with honest empty states.

---

## Asset registration (eight types)

**Finding:** Per-type separate routes increase drop-off; a **single form with type chips** matches mental model ("I'm registering *something* valuable") and aligns with API `oneOf` validation.

**Recommendation (implemented):** Chip selector clears `details` on type change; required fields validated before submit; no photo upload affordance (MP-5).

---

## Open for full Stage 3/4

- Moderated usability test on device with stressed user scenario (theft-report adjacency)
- Error-message comprehension for VIN/IMEI validation failures

**Signed:** `ux-researcher`, 2026-08-12 (Phase 1 minimum).
