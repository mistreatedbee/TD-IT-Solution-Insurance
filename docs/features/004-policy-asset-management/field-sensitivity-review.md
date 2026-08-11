# Feature 004 — Field Sensitivity Review (P-14)

**Lifecycle stage:** 8 prep — field-sensitivity ruling ahead of formal Security Review
**Author:** `cybersecurity-architect` (stub disposition; formal Stage 8 sign-off still required)
**Status:** Draft stub — sufficient to discharge **P-14** for Phase 1 implementation and Stage 8 preparation; full `security-review.md` verdict remains a hard gate per `02-feature-lifecycle.md`
**Related:** [`database-design.md`](./database-design.md) §8.4, [`api-design.md`](./api-design.md) P-14, [`06-security-standards.md`](../../organization/06-security-standards.md) Encryption / Data protection sections

---

## 1. Purpose

`database-design.md` §8.4 and `api-design.md` P-14 require a field-sensitivity review of Feature 004 MongoDB collections (`policies`, `assets`, `policy_status_history`, and `admin_access_log`) before Stage 8 Security Review. This stub records the **Phase 1 ruling** on asset-identifying and valuation fields so engineering is not blocked on field-level encryption decisions that `06-security-standards.md` reserves for a narrower class of data.

---

## 2. Scope of Review (Phase 1 collections)

| Collection | Fields reviewed | Out of scope for this stub |
|---|---|---|
| `policies` | `planTier`, `coverageLimits`, `billing.*` (reference IDs only, no PAN) | PSP webhook secrets; raw payment instruments (never stored — `database-design.md` §8.1) |
| `assets` | `displayName`, `estimatedValue`, `details.*` (VIN, serial numbers, IMEI, license plate), `photos[]` | `gpsDeviceId` / future location history (Phase 2 — **re-triggers full review**) |
| `policy_status_history` | `reason`, status transitions | — |
| `admin_access_log` | actor/target IDs, endpoint metadata | — |

**Not present in Phase 1 schema:** government ID documents, precise GPS coordinates, payment card numbers, or biometric data.

---

## 3. Ruling — Phase 1

### 3.1 Fields that are **not** payment-grade, ID-document-grade, or location-grade

Per [`06-security-standards.md`](../../organization/06-security-standards.md):

> *"Field-level encryption for the most sensitive fields (**precise location history, payment tokens if any are ever stored**) evaluated by `security-engineer` and `database-architect` together."*

The following Feature 004 Phase 1 fields **do not** fall in that category and **do not require field-level encryption** in Phase 1:

| Field(s) | Rationale |
|---|---|
| **`details.vin`** (vehicles) | Asset identifier tied to a registered item, not a government identity document. Comparable sensitivity to serial numbers — useful for recovery/claims context, not authentication-grade PII. |
| **`details.serialNumber`**, **`details.imei`** (devices) | Device identifiers for asset recovery; not payment tokens; not precise location. Standard inventory/insurance registration data. |
| **`details.licensePlate`** (optional, vehicles) | Asset/regulatory identifier; not equivalent to national ID. |
| **`estimatedValue`** (`amount`, `currency`, `asOf`) | Customer-supplied or declared valuation for coverage context; financial **metadata about an asset**, not a payment instrument or ledger entry. PCI minimization (`06-security-standards.md`) applies to card data via PSP tokenization, not to declared asset value on a policy domain document. |
| **`displayName`**, make/model/year, optional descriptive fields | Low-sensitivity descriptive metadata. |
| **`planTier`** (opaque string) | Product label only in Phase 1; no payment or identity semantics. |
| **`billing.externalCustomerId` / `externalSubscriptionId`** | PSP **reference tokens** only when populated — stored server-side, not exposed on customer API (`api-design.md` `PolicyBilling` minimization). Field-level encryption **not required** while values remain opaque vendor references and raw card data never touches MongoDB (`06-security-standards.md`, `database-design.md` §8.1). Revisit when PSP is selected if vendor mandates additional protection. |

### 3.2 Required controls (Phase 1 — instead of field-level encryption)

| Control | Source | Application |
|---|---|---|
| **Encryption at rest** | `06-security-standards.md` | MongoDB Atlas (or chosen host) storage encryption — platform baseline, not per-field. |
| **TLS in transit** | `06-security-standards.md` | All API access to policy/asset endpoints. |
| **Access control / IDOR prevention** | `06-security-standards.md`, `api-design.md` §4 | Customer data scoped from JWT `sub` only; admin reads role-gated and audited. |
| **Retention-bounded storage** | `06-security-standards.md`, `database-design.md` §7 | No TTL auto-delete on evidentiary collections; `legalHold` flag; future purge jobs subject to `compliance-specialist` period (P-04). Fields above remain subject to retention/deletion policy when ruled — encryption is not a substitute for retention limits. |
| **Audit logging** | `06-security-standards.md` | Admin cross-account reads → `admin_access_log`; asset/policy mutations auditable via domain history patterns. |
| **No raw payment data in MongoDB** | `06-security-standards.md`, `database-design.md` §8.1 | `billingStatus: not_configured` in Phase 1; PCI scope minimized when PSP integrates. |

**Phase 1 disposition:** Store VIN, serial numbers, IMEI, license plate, and `estimatedValue` in MongoDB **without field-level encryption**, with at-rest encryption and access controls as above.

---

## 4. Explicit Revisit Triggers (material change → re-open P-14)

Full or partial re-review is **mandatory** when:

1. **GPS / location data** — any collection stores precise coordinates or location history (`06-security-standards.md`: *"Location data is treated as sensitive personal data"*). Expected Phase 2 (`gps-integration-engineer`).
2. **Claims domain** — ID documents, proof-of-ownership uploads, or adjuster notes added to schema.
3. **Payment integration** — raw PSP secrets, non-token payment artifacts, or billing fields exposed beyond current minimization.
4. **Cross-border replication or new subprocessors** — compliance-driven encryption or masking requirements from `compliance-specialist`.
5. **Regulatory determination** — `compliance-specialist` rules that VIN/license plate or serial numbers require enhanced protection under POPIA for this use case (currently **not assumed** in this stub).

---

## 5. P-14 Disposition Summary

| Tracker | Prior status | After this stub |
|---|---|---|
| **`database-design.md` P-06** | Not started | **Phase 1 ruling recorded** — pending formal Stage 8 sign-off |
| **`api-design.md` P-14** | Not started | **Discharged for Phase 1 build** — field-level encryption not required for VIN/serial/estimatedValue; retention and access controls apply |

**Does not replace:** Feature 004 `security-review.md` (Stage 8 hard gate), `compliance-specialist` retention ruling (P-04/P-05), or PSP-specific PCI scope review when payment ships.

---

## 6. Pre-Approval Checklist (stub)

- [x] Field inventory covers Phase 1 `policies` and `assets` schemas.
- [x] Ruling cites `06-security-standards.md` encryption tier (location + payment tokens), not self-invented tiers.
- [x] Honest about stub status — Stage 8 formal sign-off still required.
- [x] Revisit triggers named for GPS, claims, payment, compliance.
- [ ] `security-engineer` implementation verification at Stage 9 — pending.
- [ ] `compliance-specialist` concurrence on retention/anonymization of asset-identifying fields — pending (P-05).

**Net:** P-14 blocked **implementation of field-level encryption** for named fields in Phase 1; does **not** block backend/mobile Feature 004 work or Stage 8 prep documentation.
