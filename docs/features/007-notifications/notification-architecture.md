# Feature 007 — Notification Architecture

**Owner:** `notification-engineer` · **Co-sign:** `integration-architect`, `backend-architect`  
**Status:** Design specification — **not implemented** (except auth email hook)

---

## 1. Design principles

1. **Event-driven** — domain services emit events; a Notification Service decides channels, recipients, and templates.
2. **Channel-appropriate** — not every event uses email + push + SMS. Urgency, cost, privacy, and awake-state drive the mix.
3. **No duplicate storms** — deduplicate and throttle (e.g. one “device offline” per 4h per device unless escalated).
4. **Honest catalogue** — template exists in code only when the upstream feature exists.
5. **POPIA-first** — precise location and credentials never in email body when a secure in-app link suffices ([compliance-review-notifications.md](compliance-review-notifications.md)).

---

## 2. Channel definitions

| Channel | Code | Technology (proposed) | Primary use |
|---|---|---|---|
| **Email** | `E` | Resend via Supabase hook (auth) → unified Notification Service (future) | Onboarding, receipts, detailed status, admin digests |
| **Push (app)** | `P` | Expo Push → APNs/FCM; customer mobile app | Time-sensitive: theft, device offline, payment failed, claim updates |
| **SMS** | `S` | Vendor TBD (`integration-architect`) | Critical fallback when push unreachable; OTP if required |
| **In-app inbox** | `I` | MongoDB notification feed + mobile/web UI | History, non-urgent updates, audit-friendly read state |
| **Webhook** | `W` | Partner security-company API (future) | Case assignment — not email |

**Admin / Security dashboards (web):** email + in-app toast/banner when logged in; push only if dedicated operator mobile app is built (defer).

---

## 3. Email categories

| Category | Transactional? | Marketing? | Consent |
|---|---|---|---|
| Authentication | Yes | No | Service necessity |
| Account security | Yes | No | Service necessity |
| Policy / insurance | Yes | No | Service necessity |
| Assets / GPS | Yes | No | Service necessity; location rules apply |
| Payments | Yes | No | Service necessity |
| Claims | Yes | No | Service necessity |
| Recovery / theft | Yes | No | **Critical** — theft alerts may not be fully opt-out (`notification-engineer` policy) |
| Administration | Yes (internal) | No | Employment / ops |
| Technical / SRE | Yes (internal) | No | Ops |
| Marketing / education | No | Yes | **Explicit opt-in** — separate list, unsubscribe required |

---

## 4. Priority levels

| Priority | SLA target | Examples | Default channels |
|---|---|---|---|
| **CRITICAL** | &lt; 60s | Stolen asset, geofence breach (theft mode), suspicious login (high confidence) | **P + E**; **S fallback** if push fails |
| **HIGH** | &lt; 5 min | Device offline (stolen case active), payment failed, claim decision | **P + E** |
| **NORMAL** | &lt; 15 min | Welcome, asset added, invoice ready, policy activated | **E**; **P** if user opted in |
| **LOW** | Batch / digest | Weekly admin summary, product tips | **E** digest; **P** only if marketing opt-in |

---

## 5. Event naming convention

```
<domain>.<entity>.<action>[.<qualifier>]

Examples:
auth.user.signup_completed
auth.user.email_verification_requested
asset.asset.created
asset.asset.updated
gps.device.offline
gps.device.battery_critical
policy.policy.pending_activation
payment.subscription.payment_failed
recovery.case.created
recovery.case.assigned
claim.claim.submitted
admin.customer.registered
ops.integration.gps_provider.unavailable
```

Notification Service subscribes to internal bus topics mapped 1:1 from these names.

---

## 6. Event-driven flow

```
Domain service (API / worker)
        │
        ▼
  Emit domain event (JSON)
        │
        ▼
  Notification Service
    ├── Resolve recipients (RBAC, case assignment)
    ├── Load preferences (channel opt-in/out)
    ├── Dedup / throttle key
    ├── Select template(s) per channel
    ├── Render variables (no secrets)
    ├── Enqueue per channel
    └── Write notification_delivery_log
        │
        ├── Email adapter → Resend
        ├── Push adapter → Expo Push API
        ├── SMS adapter → TBD
        └── In-app → notifications collection
```

**Do not** call Resend/Expo directly from route handlers except the existing Supabase auth hook until migration is complete.

---

## 7. Deduplication & anti-spam

| Pattern | Key | Window |
|---|---|---|
| Device offline | `gps.device.offline:{deviceId}` | 4 hours (escalate to CRITICAL if case open) |
| Payment retry | `payment.failed:{subscriptionId}` | 24 hours between customer emails |
| Login new device | `auth.login.new_device:{userId}:{deviceId}` | 1 per device per 24h |
| Location update (security) | `recovery.location:{caseId}` | 15 min batch |

---

## 8. Standard template variables

| Variable | Use | Sensitive? |
|---|---|---|
| `{{customer_first_name}}` | Greeting | Low |
| `{{customer_email}}` | Account reference | Medium |
| `{{asset_name}}` | Asset context | Low |
| `{{asset_type}}` | Display | Low |
| `{{policy_id}}` | Reference | Medium |
| `{{plan_name}}` | Display | Low |
| `{{payment_amount}}` | Billing | Medium |
| `{{invoice_number}}` | Billing | Medium |
| `{{device_name}}` | GPS | Low |
| `{{device_status}}` | GPS | Low |
| `{{last_seen_at}}` | GPS | Medium — prefer push/in-app |
| `{{incident_number}}` | Recovery | Medium |
| `{{claim_number}}` | Claims | Medium |
| `{{recovery_status}}` | Recovery | Low |
| `{{action_url}}` | Secure deep link | **Never include tokens** |
| `{{dashboard_url}}` | Web link | Low |
| `{{support_url}}` | Help | Low |

**Never in email:** raw GPS coordinates, reset/verification tokens, full session IDs, payment PAN.

---

## 9. Delivery logging (MongoDB `notification_deliveries` — proposed)

| Field | Purpose |
|---|---|
| `eventId` | Domain event name |
| `eventPayloadHash` | Dedup audit |
| `channel` | email \| push \| sms \| in_app |
| `recipientType` | customer \| admin \| security_operator |
| `recipientId` | Account or staff ID |
| `templateId` | e.g. `AUTH-001` |
| `providerMessageId` | Resend / Expo ticket ID |
| `status` | queued \| sent \| delivered \| failed \| bounced |
| `queuedAt`, `sentAt`, `deliveredAt`, `failedAt` | Timestamps |
| `failureReason` | Provider error (sanitized) |
| `relatedCustomerId`, `relatedAssetId`, `relatedPolicyId`, `relatedCaseId` | Correlation |

Do **not** store full rendered HTML bodies long-term; retain metadata + template ID only (compliance C-NOTIF-3).

---

## 10. Failure handling

| Failure | Retry | Fallback |
|---|---|---|
| Resend 5xx | 3× exponential backoff | Queue dead-letter; alert ops |
| Expo push `DeviceNotRegistered` | No | Mark token invalid; email if HIGH+ |
| SMS failure | 2× | Email if CRITICAL |
| Template render error | No | Dead-letter + ops alert |
| Rate limit | Delay queue | Spread sends |

Critical theft path: if push fails within 60s → SMS fallback (if phone on file and consent) → email (no coordinates).

---

## 11. Auth email migration note

Today: Supabase Auth → `auth-send-email` hook → Resend (events: signup, recovery, invite, magiclink, reauthentication, email_change).

Future: Auth events **also** emit `auth.*` domain events so push (“Verify your email”) and in-app inbox stay consistent. Hook remains until Notification Service owns all auth email.

---

## 12. Open decisions (require client / architect)

| ID | Decision | Owner |
|---|---|---|
| OQ-N01 | SMS vendor (Twilio, MessageBird, etc.) | `integration-architect` |
| OQ-N02 | Can customers opt out of non-theft push? | `product-manager` |
| OQ-N03 | Security-company notification: email vs webhook vs portal only | `integration-architect` |
| OQ-N04 | Retention period for delivery logs | `compliance-specialist` |
| OQ-N05 | Marketing email separate product? | `product-manager` |
