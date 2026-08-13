# Feature 007 — Mobile App Push Notifications Specification

**Owner:** `notification-engineer` + `mobile-engineer`  
**Status:** **PARTIALLY IMPLEMENTED** — token registration + Expo send adapter live; preference UI pending  
**Related:** [`notification-architecture.md`](notification-architecture.md), [`master-notification-matrix.md`](master-notification-matrix.md)

---

## 1. Scope

This document covers **customer mobile app push** (iOS/Android via Expo). Admin and Security Company **web dashboards** use email + in-app banners unless a dedicated operator app is built later.

---

## 2. Technology stack (proposed)

| Layer | Choice | Notes |
|---|---|---|
| Client | `expo-notifications` | Permission flow, token, foreground handler |
| Transport | Expo Push API | Server-side; no direct APNs/FCM keys in mobile app |
| Token storage | MongoDB `device_push_tokens` | Linked to `accountId` + physical device |
| Server send | Notification Service → Expo adapter | Batch tickets, receipt polling |
| Deep links | `tditinsurance://` + universal links (future) | Route to case, asset, claim, billing |

---

## 3. Push categories (Android channels / iOS thread IDs)

| Category ID | User-visible name | Importance | Opt-out? |
|---|---|---|---|
| `theft_critical` | Theft & recovery alerts | MAX / critical | **No** (product policy — confirm with PM) |
| `device_status` | Device & GPS status | High | Partial (offline reminders yes; theft mode overrides) |
| `billing` | Payments & invoices | Default | Yes |
| `account` | Account & security | High | Partial (security alerts recommended on) |
| `claims` | Claims updates | Default | Yes |
| `general` | General updates | Low | Yes |
| `marketing` | Tips & offers | Low | Yes — **opt-in only** |

---

## 4. Permission UX (mobile)

1. **After first asset registered** — explain value before system prompt (theft recovery).
2. **On report stolen** — if denied, show settings deep link; offer SMS fallback signup.
3. **Settings screen** — per-category toggles (except `theft_critical` if policy requires).

---

## 5. Payload schema (Expo)

```json
{
  "to": "ExponentPushToken[xxxx]",
  "title": "Asset theft reported",
  "body": "Tracking active for MacBook Pro. Open app for live status.",
  "data": {
    "event": "recovery.case.created",
    "caseId": "…",
    "assetId": "…",
    "deepLink": "tditinsurance://recovery/cases/…",
    "priority": "critical"
  },
  "channelId": "theft_critical",
  "priority": "high",
  "sound": "default"
}
```

**Rules:**
- **No GPS coordinates in push body** — use “Open app for location” (POPIA + shoulder surfing).
- **No auth tokens** in `data`.
- `deepLink` must match allowlisted routes.

---

## 6. Deep link routing (customer app)

| Event area | Deep link pattern | Screen |
|---|---|---|
| Email verify | `tditinsurance://verify-email?…` | **Exists** |
| Password reset | `tditinsurance://reset-password?…` | **Exists** |
| Theft / recovery | `tditinsurance://recovery/cases/{id}` | Scaffold |
| Asset detail | `tditinsurance://assets/{id}` | **Exists** |
| Policy | `tditinsurance://policies/{id}` | **Exists** |
| Payment failed | `tditinsurance://billing/retry` | **Not built** |
| Claim | `tditinsurance://claims/{id}` | Scaffold |
| New login alert | `tditinsurance://account/security` | **Not built** |

---

## 7. API endpoints (proposed — not built)

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/v1/devices/push-token` | Register/update Expo token (auth required) |
| `DELETE` | `/api/v1/devices/push-token` | Logout / revoke |
| `GET` | `/api/v1/notifications/preferences` | Channel preferences |
| `PATCH` | `/api/v1/notifications/preferences` | Update opt-in/out |
| `GET` | `/api/v1/notifications` | In-app inbox (cursor paginated) |
| `PATCH` | `/api/v1/notifications/{id}/read` | Mark read |

---

## 8. When to use Push vs Email vs SMS

| Scenario | Push | Email | SMS |
|---|---|---|---|
| Stolen asset reported | **Primary** | Yes (confirmation, no coords) | Fallback if push fails |
| Device offline (normal) | Yes (throttled) | Optional digest | No |
| Device offline (active theft case) | **Yes** | Yes | Fallback |
| Payment failed | Yes | Yes | Optional day 3 |
| Welcome / verify email | No | **Primary** | No |
| Password reset | No | **Primary** | No |
| Claim approved | Yes | Yes | No |
| Marketing | Only if opt-in | Yes | No |

---

## 9. Implementation checklist

- [ ] Add `expo-notifications` + permission flow (`mobile-engineer`)
- [ ] Token upload on login / refresh (`mobile-engineer`)
- [ ] MongoDB schema + indexes (`database-architect`)
- [ ] Notification Service Expo adapter (`notification-engineer`)
- [ ] Preference center UI (`mobile-engineer` + `ui-designer`)
- [ ] Wire first events: `auth.login.new_device`, `recovery.case.created` (`authentication-engineer`, `gps-integration-engineer`)
- [ ] Stage 8 security review for push payload + token storage (`security-engineer`)
- [ ] E2E test with Expo push tool (`automation-qa-engineer`)

---

## 10. Testing

- **Development:** Expo push notification tool + physical device
- **Staging:** Dedicated Expo project; MP-8 separate DB
- **Production:** EAS credentials; monitor Expo delivery receipts

Do not send test theft pushes to real customers without QA sign-off.
