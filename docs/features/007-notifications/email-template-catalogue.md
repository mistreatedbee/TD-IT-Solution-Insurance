# Feature 007 — Email Template Catalogue

**Owner:** `ui-designer` + `technical-writer` + `notification-engineer`  
**Status:** Auth templates **SHIPPED**; all other IDs are **PLANNED** designs  
**Brand reference:** `supabase/functions/auth-send-email/templates/` (live)

---

## 1. Global layout (all emails)

Every transactional email uses the shared layout from `layout.ts`:

- Gradient header with TD IT Solutions Insurance logo
- Themed hero icon per event type (`helpers.ts`)
- Primary CTA button (secure link — never embed tokens in body text outside OTP box)
- Trust badges / stat pills where appropriate
- Signature block: [`signature.ts`](../../../supabase/functions/auth-send-email/templates/signature.ts) — Kind regards, Mr Thabo Derrick Magagula, Suite 9 39 Emkher Street Nelspruit, phones, `notifications@tditsolutionsinsurance.co.za`, reg **2019/565817/07**, disclaimer
- MSO/Outlook fallbacks in `layout.ts`

**Sender:** `TD IT Solutions Insurance <notifications@tditsolutionsinsurance.co.za>`  
**Reply-to:** support address (TBD in ops runbook)

---

## 2. Shipped templates (Supabase auth hook)

| Template ID | Supabase action | Subject key | Theme colour | Hero |
|---|---|---|---|---|
| `signup` | signup, magiclink | Verify your email | Brand blue | Envelope + shield |
| `recovery` | recovery | Reset your password | Amber alert | Key |
| `invite` | invite | You're invited | Purple | User add |
| `reauthentication` | reauthentication | Your verification code | Teal | Lock + OTP box |
| `email_change` | email_change | Confirm email change | Blue | Mail swap |

**Code paths:** `supabase/functions/auth-send-email/templates/*.ts`

---

## 3. Planned templates — by domain

### Authentication (post-hook migration)

| ID | Name | Subject line (draft) | CTA | Priority theme |
|---|---|---|---|---|
| AUTH-007 | Password changed | Your password was updated | Review security settings | Amber |
| AUTH-008 | New device login | New sign-in to your account | Secure account | Red accent |
| AUTH-009 | Suspicious login | Unusual activity detected | Secure account | Red |
| AUTH-010 | MFA changed | Two-factor authentication updated | Account settings | Teal |
| AUTH-011 | Account locked | Your account is temporarily locked | Contact support | Grey |
| AUTH-012 | Account deletion | Account closure confirmation | — | Grey |

### Onboarding

| ID | Subject (draft) | CTA |
|---|---|---|
| ONB-001 | Welcome to TD IT Solutions Insurance | Get started |
| ONB-002 | Complete your setup | Continue onboarding |
| ONB-003 | Your policy is ready | View policy |
| ONB-004 | Asset protected | View asset |
| ONB-005 | Connect your GPS device | Setup guide |
| ONB-006 | Complete your profile | Update profile |

### Policy

| ID | Subject (draft) |
|---|---|
| POL-001 | Policy pending — action required |
| POL-002 | Your policy is now active |
| POL-003 | Renewal reminder — {{days}} days |
| POL-004 | Policy renewed |
| POL-005 | Plan change confirmed |
| POL-006 | Cancellation scheduled |
| POL-007 | Policy ended |
| POL-008 | Coverage review recommended |
| POL-009 | Your policy documents |

### Assets & GPS

| ID | Subject (draft) | Content rule |
|---|---|---|
| AST-004 | Theft reported — we're on it | No map/coords in email |
| GPS-002 | Device offline — {{asset_name}} | Last seen time OK; no coords |
| GPS-005 | Geofence alert — theft case active | Case ref only |

### Payments

| ID | Subject (draft) |
|---|---|
| PAY-001 | Payment receipt — {{amount}} |
| PAY-002 | Payment failed — action required |
| PAY-004 | Subscription suspended |

### Recovery & claims

| ID | Subject (draft) |
|---|---|
| REC-001 | Theft case {{incident_number}} opened |
| REC-005 | Great news — asset recovered |
| CLM-001 | Claim {{claim_number}} received |
| CLM-004 | Claim approved |
| CLM-006 | Claim decision |

---

## 4. Push notification copy (paired with email)

Push titles are shorter; bodies must not include coordinates or credentials. Full copy spec in [`push-notifications-spec.md`](push-notifications-spec.md).

| Matrix ID | Push title (draft) | Push body (draft) |
|---|---|---|
| AUTH-008 | New sign-in | A new device signed in to your account. Tap to review. |
| AST-004 | Theft reported | Tracking active for {{asset_name}}. Open app for status. |
| GPS-002 | Device offline | {{device_name}} hasn't checked in. Open app for details. |
| GPS-005 | Geofence alert | Movement detected on active theft case. Open app now. |
| PAY-002 | Payment failed | We couldn't process {{amount}}. Update payment method. |
| REC-004 | Asset located | Your asset may have been found. Open app for details. |
| CLM-003 | Claim update | We need more information for claim {{claim_number}}. |

---

## 5. Variable dictionary

See [`notification-architecture.md`](notification-architecture.md) §8. Template authors must use whitelisted variables only; renderer rejects unknown keys in production.

---

## 6. Localization

**Phase 1:** English (South Africa) only.  
**Phase 2:** Afrikaans / Zulu — requires `technical-writer` + legal review of insurance terms.

---

## 7. Preview & QA

| Environment | Method |
|---|---|
| Auth emails | Supabase Auth test user + Resend dashboard |
| Planned templates | Storybook or HTML snapshot tests (`automation-qa-engineer`) |
| Push | Expo push tool + device matrix iOS/Android |

Every new template requires: dark-mode legibility check (email clients), mobile width 320px, link tests, compliance flag review.
