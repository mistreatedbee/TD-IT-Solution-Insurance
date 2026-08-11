# Mobile E2E scaffold (Maestro)

**Owner:** `automation-qa-engineer`  
**Status:** Scaffold only — flows require Brevo (real email verification) or a test bypass not yet built.

## Prerequisites

1. [Maestro CLI](https://maestro.mobile.dev/) installed
2. Device/simulator with a **preview** EAS build (`mobile/docs/DEPLOY.md`)
3. Backend reachable from device (`EXPO_PUBLIC_API_BASE_URL`)
4. Test account with **verified** email (blocked until Brevo configured)

## Run

```bash
cd mobile
maestro test e2e/flows/
```

## Flows

| File | Scenario | Blocker |
|---|---|---|
| `policy-asset-happy-path.yaml` | Login → register asset → view list | Verified test account + staging API |

## MP-8

Run E2E against a **separate Mongo database name** on Atlas, not production data. See `backend/docs/DEPLOY.md`.
