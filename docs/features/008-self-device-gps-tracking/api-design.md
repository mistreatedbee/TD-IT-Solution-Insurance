# Feature 008 — Self-Device Location Tracking (Phase 1)
## API Design Addendum — Stage 7

**Lifecycle stage:** 7 — API Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `gps-integration-engineer` (ingestion/read contract); implements against [`backend-architect`](../004-policy-asset-management/api-design.md) platform conventions.
**Status:** Draft — design contract only. **No backend or mobile implementation exists yet** (verified 2026-08-14: no location routes under `backend/src/routes/`, no `expo-location` in `mobile/package.json`).
**Contract version:** 1.0.0 (2026-08-14)
**Formalizes:** [`architecture.md`](./architecture.md) §3 (conceptual event shape), [`business-requirements.md`](./business-requirements.md) (FR-SD-01…05, BR-SD-01…03), [ADR-0009](../../organization/adr/0009-self-asserted-location-ingestion-trust-boundary.md) SDL-1…SDL-12.
**Reuses verbatim:** [`001-authentication/api-design.md`](../001-authentication/api-design.md) — error envelope, cursor pagination (N/A here), rate-limit headers, `/api/v1` prefix, idempotency on writes; [`004-policy-asset-management/api-design.md`](../004-policy-asset-management/api-design.md) §4.2 — `accountId` never client-supplied.

---

## 0. Scope

**In scope (Phase 1):** customer-authenticated self-device location **ingestion** (foreground/on-demand only), **last-known-location read** for one asset, **account-level location summary** for map rendering, and **server-side consent** opt-in/opt-out for `assetType: smartphone` only.

**Explicitly out of scope:**
- **Laptop, desktop, tablet, vehicle, and all other asset types** — they cannot self-report via the mobile app (no desktop/Windows/macOS client; most laptops lack reliable GPS). Recovery for those types remains **Phase 2 hardware-tracker ingestion** (`integration-architect` vendor decision, `gps-integration-engineer` hardware pipeline). Server rejects ingestion for non-`smartphone` assets (SDL-11).
- Background / periodic location, live movement map, route history, geofencing, theft-mode elevation, security-company partner reads, and writing into `recovery_cases.lastLocation` from self-asserted pings.
- Admin or partner-operator location endpoints (ADR-0006 AUD-9 third trail — separate contract when built).

**SDL-2 (ADR-0009) — binding on every consumer of this API:** a record with `assertionMode: self_asserted` **may not, on its own**, dispatch a security-company partner, adjudicate a claim, alter billing/policy status, or trigger any automated physical-world action. Self-asserted coordinates may be shown to the asset owner and retained as labelled customer-supplied claims only. Copying a self-asserted fix into `recovery_cases.lastLocation` or any partner-facing operational field without independent corroboration and a documented human decision step violates SDL-2.

---

## 1. Service boundary

Self-device location routes mount in the existing Policy & Asset Service router (`backend/src/routes/assets.ts` or a sibling `location.ts` module), in-process with Identity Service per Feature 004 §2. Domain data → MongoDB (ADR-0002). Consent **state-change events** → identity audit trail (Trail A, SDL-4); location **records** → MongoDB; non-owner **reads** → AUD-9 trail when those surfaces exist (SDL-5).

`source` and `assertionMode` are **server-derived on every write** from the ingestion path — never accepted from the request body (SDL-1).

---

## 2. Authorization and device binding

### 2.1 Token and account scoping

Every endpoint requires the standard bearer session (`001-authentication` §1). `accountId` is always `sub` from the token — never a path/query/body parameter.

### 2.2 Write gates (ingestion + opt-in)

Before accepting `POST …/location-events` or `POST …/location-consent`:

| Check | Failure code |
|---|---|
| Account live-active (`GET /v1/internal/accounts/{id}/status`) | `403 ACCOUNT_NOT_ACTIVE` |
| Asset owned by caller | `404 NOT_FOUND` |
| `asset.assetType === 'smartphone'` | `403 ASSET_NOT_ELIGIBLE` |
| Active server-side consent record (ingestion only) | `403 LOCATION_CONSENT_REQUIRED` |
| Session has a **bound `deviceId`** (fail closed — absent binding rejects, does not skip) | `403 DEVICE_BINDING_REQUIRED` |
| On ingestion: session `deviceId` matches the opt-in record's bound device (SDL-10) | `403 DEVICE_BINDING_MISMATCH` |

Opt-in (`POST …/location-consent`) additionally requires a **step-up credential** (fresh password or MFA verification token in request body — exact mechanism reuses Feature 001's existing step-up pattern; SDL-9).

### 2.3 Device binding rules (SDL-10)

- Each opt-in record stores the session's `deviceId` at consent time.
- Each ingested record stores the reporting `deviceId`.
- If the account later authenticates from a **different bound device** for an opted-in asset, ingestion is refused until the customer completes **re-consent** on the new device; opt-out remains available from any authenticated session.
- Device binding is **asserted, not proven** — the platform records which install reported, but cannot cryptographically verify the app runs on the insured handset (residual risk bounded by SDL-2).

---

## 3. Rate limits

All limits keyed per `account_id` unless noted. Surfaced via `X-RateLimit-*` / `Retry-After` per Feature 001 §5.

| Endpoint | Limit | Rationale |
|---|---|---|
| `POST /v1/assets/{assetId}/location-events` | **12 requests / 60 min** per `(accountId, assetId)` | SDL-3 / MP-7 — privacy-sized for foreground/on-demand; blocks dense history from a compromised session |
| `POST /v1/assets/{assetId}/location-consent` | **5 requests / 60 min** per `(accountId, assetId)` | Consent mutations are rare; limits abuse of step-up |
| `DELETE /v1/assets/{assetId}/location-consent` | **10 requests / 60 min** per `accountId` | Opt-out must stay low-friction |
| `GET /v1/assets/{assetId}/location` | **100 requests / 60 min** per `accountId` | Platform default (`DEFAULT_AUTHENTICATED_LIMIT`) |
| `GET /v1/location-summary` | **60 requests / 60 min** per `accountId` | Map/dashboard polling; slightly below default |

---

## 4. Endpoints

Paths below are mounted under `/api/v1`.

### 4.1 `POST /v1/assets/{assetId}/location-events`

Submit one self-device location fix.

**Headers:** `Authorization`, `Idempotency-Key` (required — mobile retry safety)

**Request body:**

```jsonc
{
  "latitude": -26.2041,           // number, -90…90
  "longitude": 28.0473,           // number, -180…180
  "accuracyMeters": 12.5,         // number, optional, ≥ 0
  "capturedAt": "2026-08-14T08:15:00.000Z",  // ISO-8601, device clock (claim only)
  "triggeredBy": "foreground_open" // enum: "foreground_open" | "manual_refresh" only (SDL-11)
}
```

**Response `201`:**

```jsonc
{
  "id": "66bc…",                  // location record id
  "assetId": "66ab…",
  "latitude": -26.2041,
  "longitude": 28.0473,
  "accuracyMeters": 12.5,
  "capturedAt": "2026-08-14T08:15:00.000Z",
  "receivedAt": "2026-08-14T08:15:02.114Z",   // server clock — authoritative for ordering (SDL-7)
  "source": "self_device",        // server-derived (SDL-1)
  "assertionMode": "self_asserted",
  "triggeredBy": "foreground_open",
  "deviceId": "expo-device-uuid…"  // from session binding
}
```

**Errors:** `400 VALIDATION_ERROR`, `403` codes in §2.2, `404 NOT_FOUND`, `409 IDEMPOTENCY_KEY_REUSE`, `429` rate limit.

Coordinates must not appear in error messages or logs (SDL-6).

---

### 4.2 `GET /v1/assets/{assetId}/location`

Last known location for one smartphone asset owned by the caller.

**Response `200`:**

```jsonc
{
  "assetId": "66ab…",
  "hasLocation": true,
  "location": {
    "latitude": -26.2041,
    "longitude": 28.0473,
    "accuracyMeters": 12.5,
    "capturedAt": "2026-08-14T08:15:00.000Z",
    "receivedAt": "2026-08-14T08:15:02.114Z",
    "source": "self_device",
    "assertionMode": "self_asserted",
    "triggeredBy": "foreground_open",
    "ageSeconds": 3600          // server-computed from receivedAt
  },
  "consent": {
    "status": "active",         // "active" | "none" | "withdrawn"
    "optedInAt": "2026-08-13T10:00:00.000Z",
    "consentCopyVersion": "2026-08-14-v1"
  }
}
```

When no fix exists: `hasLocation: false`, `location: null` (AC-SD-04 — no placeholder coordinates).

Owner read — **not** privileged access; no AUD-9 trail row (SDL-5).

---

### 4.3 `GET /v1/location-summary`

**Multi-device read model** — all caller-owned assets eligible for the account map (smartphone assets with active consent and/or a stored last-known point).

**Response `200`:**

```jsonc
{
  "items": [
    {
      "assetId": "66ab…",
      "displayName": "My iPhone",
      "assetType": "smartphone",
      "consentStatus": "active",
      "lastLocation": {
        "latitude": -26.2041,
        "longitude": 28.0473,
        "accuracyMeters": 12.5,
        "capturedAt": "2026-08-14T08:15:00.000Z",
        "receivedAt": "2026-08-14T08:15:02.114Z",
        "source": "self_device",
        "assertionMode": "self_asserted",
        "ageSeconds": 3600
      }
    }
  ],
  "generatedAt": "2026-08-14T09:15:02.114Z"
}
```

- Includes only `assetType: smartphone` assets for the token's account.
- Omits non-phone asset types entirely (laptop/desktop never appear here).
- When Phase 2 hardware tracking ships, the same endpoint merges `source: hardware_tracker` / `assertionMode: device_attested` rows using the same `lastLocation` shape; server picks the fresher `receivedAt` per asset (composition rule owned by `backend-architect` at implementation time).
- No pagination in Phase 1 — bounded by per-account asset limits (Feature 004).

---

### 4.4 `POST /v1/assets/{assetId}/location-consent`

Opt in to self-device tracking for one smartphone asset.

**Headers:** `Authorization`, `Idempotency-Key`

**Request body:**

```jsonc
{
  "consentCopyVersion": "2026-08-14-v1",  // version of primer copy shown (SDL-4)
  "attestation": "own_device_personally_carried",  // PM-SD-04 — required enum in Phase 1
  "stepUp": {
    "type": "mfa",                        // "password" | "mfa"
    "mfaVerificationToken": "…"           // or password + existing session fields per Feature 001 step-up
  }
}
```

**Response `201`:** `{ "assetId", "status": "active", "optedInAt", "deviceId", "consentCopyVersion" }`

Writes a Trail A account-security event (SDL-4). Triggers out-of-band notification to verified email (SDL-9) when delivery path is available.

---

### 4.5 `DELETE /v1/assets/{assetId}/location-consent`

Opt out — effective immediately; subsequent ingestion rejected (SDL-9).

**Response `204`**. Trail A event + notification per SDL-4/SDL-9.

---

## 5. OpenAPI 3.1 (condensed)

```yaml
openapi: 3.1.0
info:
  title: TD IT Solutions — Self-Device Location API (Feature 008 Phase 1)
  version: "1.0.0"
servers:
  - url: /v1
security:
  - bearerAuth: []

paths:
  /assets/{assetId}/location-events:
    post:
      operationId: ingestSelfDeviceLocation
      summary: Submit one foreground/on-demand self-device location fix.
      parameters:
        - { name: assetId, in: path, required: true, schema: { type: string } }
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/LocationEventWrite' }
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LocationRecord' }
        '403': { description: ACCOUNT_NOT_ACTIVE | ASSET_NOT_ELIGIBLE | LOCATION_CONSENT_REQUIRED | DEVICE_BINDING_* }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /assets/{assetId}/location:
    get:
      operationId: getAssetLastLocation
      summary: Last known self-device location for one owned smartphone asset.
      parameters:
        - { name: assetId, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AssetLocationView' }

  /location-summary:
    get:
      operationId: getLocationSummary
      summary: Account map — last known location for all eligible smartphone assets.
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LocationSummaryPage' }

  /assets/{assetId}/location-consent:
    post:
      operationId: optInLocationTracking
      parameters:
        - { name: assetId, in: path, required: true, schema: { type: string } }
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/LocationConsentOptIn' }
      responses:
        '201': { description: Consent active }
    delete:
      operationId: optOutLocationTracking
      parameters:
        - { name: assetId, in: path, required: true, schema: { type: string } }
      responses:
        '204': { description: Consent withdrawn }

components:
  schemas:
    LocationEventWrite:
      type: object
      required: [latitude, longitude, capturedAt, triggeredBy]
      properties:
        latitude: { type: number, minimum: -90, maximum: 90 }
        longitude: { type: number, minimum: -180, maximum: 180 }
        accuracyMeters: { type: number, minimum: 0 }
        capturedAt: { type: string, format: date-time }
        triggeredBy:
          type: string
          enum: [foreground_open, manual_refresh]
    LocationRecord:
      allOf:
        - { $ref: '#/components/schemas/LocationEventWrite' }
        - type: object
          required: [id, assetId, receivedAt, source, assertionMode, deviceId]
          properties:
            id: { type: string }
            assetId: { type: string }
            receivedAt: { type: string, format: date-time }
            source: { type: string, enum: [self_device] }
            assertionMode: { type: string, enum: [self_asserted] }
            deviceId: { type: string }
    AssetLocationView:
      type: object
      required: [assetId, hasLocation, consent]
      properties:
        assetId: { type: string }
        hasLocation: { type: boolean }
        location: { $ref: '#/components/schemas/LocationRecord', nullable: true }
        consent: { $ref: '#/components/schemas/ConsentStatus' }
    LocationSummaryPage:
      type: object
      required: [items, generatedAt]
      properties:
        items:
          type: array
          items: { $ref: '#/components/schemas/LocationSummaryItem' }
        generatedAt: { type: string, format: date-time }
    LocationSummaryItem:
      type: object
      required: [assetId, displayName, assetType, consentStatus]
      properties:
        assetId: { type: string }
        displayName: { type: string }
        assetType: { type: string, enum: [smartphone] }
        consentStatus: { type: string, enum: [active, none, withdrawn] }
        lastLocation: { $ref: '#/components/schemas/LocationRecord', nullable: true }
    ConsentStatus:
      type: object
      properties:
        status: { type: string, enum: [active, none, withdrawn] }
        optedInAt: { type: string, format: date-time, nullable: true }
        consentCopyVersion: { type: string, nullable: true }
    LocationConsentOptIn:
      type: object
      required: [consentCopyVersion, attestation, stepUp]
      properties:
        consentCopyVersion: { type: string }
        attestation: { type: string, enum: [own_device_personally_carried] }
        stepUp: { type: object }
```

Shared components (`Error`, `bearerAuth`, `IdempotencyKey`, `TooManyRequests`) — `$ref` Feature 001 / 004; not duplicated here (P-11).

---

## 6. Mobile client contract notes

- Mobile calls `POST …/location-events` on app foreground/resume and on explicit "Update location" only (`triggeredBy` values above).
- Mobile must not call ingestion for assets other than the smartphone the app is installed on (FR-SD-05); server enforces ownership + type regardless.
- Display copy must treat `assertionMode: self_asserted` as **last known**, not live tracking (BR-SD-03, AC-SD-03).
- **Do not** wire self-asserted coordinates into recovery-case creation or partner dispatch flows (SDL-2).

---

## 7. Open items

| ID | Item | Owner | Blocks |
|---|---|---|---|
| **GPS-API-01** | MongoDB collections (`location_events`, consent store), indexes, retention purge job (SDL-8) | `database-architect` | Implementation |
| **GPS-API-02** | Step-up request shape alignment with Feature 001 session/MFA routes | `authentication-engineer` | Opt-in endpoint |
| **GPS-API-03** | Field-sensitivity / FLE evaluation before first write (SDL-6, AUD-12) | `cybersecurity-architect` | Stage 8 |
| **GPS-API-04** | Consent record mechanism (C-008-3) — append-only purpose `location.self_device` | `backend-engineer` + `compliance-specialist` | Opt-in endpoint |
| **GPS-API-05** | Hardware-tracker merge rules for `GET /location-summary` | `gps-integration-engineer` | Phase 2 only |

---

## 8. Pre-approval checklist

- [x] Endpoints scoped to smartphone + foreground/on-demand only (SDL-11).
- [x] Provenance fields server-derived; client cannot set `source` / `assertionMode` (SDL-1).
- [x] SDL-2 use-limitation stated explicitly (§0).
- [x] Device binding fail-closed; re-consent on device change (SDL-10).
- [x] Privacy-sized ingestion rate limit (SDL-3).
- [x] Laptop/desktop excluded; hardware GPS deferred to Phase 2 (§0).
- [ ] `database-architect` schema sign-off — pending (GPS-API-01).
- [ ] Stage 8 security review — pending.
- [ ] `solution-architect` cross-domain review — pending.

---

## 9. Summary

Five endpoints: **`POST /v1/assets/{assetId}/location-events`**, **`GET /v1/assets/{assetId}/location`**, **`GET /v1/location-summary`**, **`POST /v1/assets/{assetId}/location-consent`**, **`DELETE /v1/assets/{assetId}/location-consent`**. Self-asserted coordinates are labelled and rate-limited; they must not alone drive partner dispatch (SDL-2). Multi-device map reads use `location-summary`. Laptop/desktop and hardware-tracker ingestion remain out of scope for Phase 1.
