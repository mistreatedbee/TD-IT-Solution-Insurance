# 07 — Tracking Provider Abstraction & Data Model

**Platform Architect** (`gps-integration-engineer`, `database-architect`, `backend-architect`)

---

## 1. Design principle

UI reads **capabilities**, not assumptions. Each asset has a `trackingProfile` resolved from:

1. Asset type
2. Assigned device (if any)
3. Self-device binding (if any)

---

## 2. TypeScript interfaces (client + server shared concept)

```typescript
/** Provider-agnostic — implement per vendor adapter */
interface TrackingProvider {
  id: string; // 'self_device' | 'hardware_vendor_x' | ...
  ingestPing(payload: IngestPing): Promise<void>;
  getLastLocation(assetId: string): Promise<LocationFix | null>;
  getCapabilities(deviceId: string): Promise<DeviceCapabilitySet>;
}

interface DeviceCapabilitySet {
  liveLocation: boolean;
  periodicLocation: boolean;
  battery: boolean;
  cellularSignal: boolean;
  speed: boolean;
  heading: boolean;
  ignition: boolean;
  geofencing: boolean;
  tripHistory: boolean;
  remoteCommands: boolean;
}

interface LocationFix {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  recordedAt: string; // ISO
  source: 'self_device' | 'hardware';
  freshness: 'live' | 'last_known' | 'stale';
}

interface DeviceTelemetry {
  batteryPercent?: number;
  signalStrength?: 'none' | 'weak' | 'good' | 'strong';
  gpsFix?: 'none' | 'weak' | 'strong';
  movementState?: 'moving' | 'stationary' | 'unknown';
  speedKmh?: number;
  headingDegrees?: number;
  reportedAt: string;
}

interface TrackingDevice {
  id: string;
  providerId: string;
  deviceTypeId: string;
  serialOrImei?: string;
  capabilities: DeviceCapabilitySet;
  assignment?: DeviceAssignment;
}

interface DeviceAssignment {
  assetId: string;
  assignedAt: string;
  activatedAt?: string;
}

interface LocationEvent {
  id: string;
  assetId: string;
  fix: LocationFix;
  telemetry?: DeviceTelemetry;
}

interface DeviceAlert {
  id: string;
  assetId: string;
  category: 'security' | 'tracking' | 'device' | 'insurance' | 'payment' | 'account';
  severity: 'critical' | 'high' | 'warning' | 'info';
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
}
```

**Phase 1 implementation:** `SelfDeviceTrackingProvider` only — wraps existing `POST /assets/:id/location-report`.

**Phase 4:** `HardwareTrackingProvider` — vendor webhook ingestion (TBD by `integration-architect`).

---

## 3. Capability → UI matrix

| UI feature | self_device (Phase 1) | hardware (future) |
|------------|----------------------|-------------------|
| Last known map pin | ✅ | ✅ |
| Live moving dot | ❌ | ✅ if supported |
| Battery | ❌ | ✅ if supported |
| Speed / heading | ❌ | ✅ if supported |
| Trip history | ❌ | ✅ if supported |
| Geofences | ❌ | ✅ if supported |
| Device activation wizard | ❌ (consent only) | ✅ |
| Installation guide | ❌ | ✅ configurable |

---

## 4. Database relationship recommendations

### Exists today (Mongo)

| Entity | Collection | Notes |
|--------|------------|-------|
| Asset | `assets` | + `lastLocation`, `locationSource`, `reportingDeviceId` |
| Recovery case | `recovery_cases` | + `lastLocation` (nullable) |
| Policy | `policies` | |
| Notification prefs | `notification_preferences` | |

### Recommended additions (phased)

| Entity | Collection | Phase |
|--------|------------|-------|
| `location_events` | time-series pings | Phase 5 — REQUIRES BACKEND |
| `tracking_devices` | hardware registry | Phase 4 — REQUIRES HARDWARE |
| `device_assignments` | link device ↔ asset | Phase 4 |
| `device_telemetry` | latest telemetry snapshot | Phase 4 |
| `alerts` | customer/operator alerts | Phase 6 |
| `geofences` | customer zones | Phase 9 — FUTURE |
| `trips` | derived routes | Phase 9 — FUTURE |
| `customer_profiles` | extended PII | Phase 2 — Postgres or Mongo (ADR) |
| `verification_requests` | KYC state | Phase 2 |
| `documents` | metadata + storage ref | Phase 3 — object storage |
| `claims` | claims | Phase 7 |
| `subscriptions` / `payments` | billing | Phase 10+ |

### Postgres (identity) — keep

User/account/session/MFA/invitations — no change.

**Do not** add a second database.

---

## 5. Service layer (mobile)

```
mobile/src/tracking/
  types.ts              — interfaces above
  TrackingCapabilityService.ts  — resolve UI flags per asset
  providers/
    SelfDeviceProvider.ts       — wraps asset-location API
    HardwareProvider.ts         — stub throws NotImplemented
  hooks/
    useProtectionDashboard.ts
    useAssetTrackingProfile.ts
```

Web customer dashboard mirrors same hooks under `src/customer/tracking/`.

---

## 6. Notification architecture

**Existing:** push + email prefs by category (`notification_preferences`).

**Extend:**

1. **Event bus** (backend) — theft reported, location stale, device offline, payment failed
2. **Fan-out** — push + in-app alert record
3. **Alert centre** reads in-app records; push is delivery channel

Phase 1: client-derived alerts (see 05-customer-home-dashboard.md §4).  
Phase 6: server-persisted alerts collection.

**Critical security alerts:** `theft_critical.push` remains non-disableable (existing).

---

## 7. Geofencing & trip history

- **UI:** Design geofence editor + trip list screens behind feature flag
- **Label:** "Coming soon — requires GPS tracker"
- **Do not** implement fake routes

---

## 8. ADR alignment

- **ADR-0009:** Self-asserted location cannot alone trigger dispatch/claims
- **ADR-0006:** Partner location read requires AUD-9 audit + case purpose
- **Feature 008 BR:** Foreground-only self-device; honest last-known labelling
