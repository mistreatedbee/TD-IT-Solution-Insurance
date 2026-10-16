# Google Play: move to an Organization account (parked plan)

Status: **PARKED** — recorded 2026-10-16 at the owner's request; to be picked up later.
Trigger to resume: the owner says **"The D-U-N-S number is ready"**.
Nothing in this note has been done. Items marked *unverified* come from memory
and must be checked against current Google Play Console Help before relying on them.

## Context

- App: insurance / asset-protection app for the South African market.
- Current Play account: **Individual**. Financial/insurance apps are understood to need an
  **Organization** account (*unverified wording — confirm current policy*). INC-002 also
  records Google Play's requirement for a verified organisation account.
- Blocker: a 9-digit **D-U-N-S number** for the company, based on its CIPC documents.

## Now: getting the D-U-N-S number

1. Gather the CIPC documents. Registered name, registration number and address must be
   identical, character for character, across CIPC, D&B and Play Console.
2. Check whether the company already has a D-U-N-S number: https://my.dnb.com/lookup
   (do not apply for a duplicate).
3. If not, apply via the route Google documents for Play (free), or via the TransUnion
   address the owner has (dnb@transunion.co.za). *Unverified:* that TransUnion is D&B's
   South African partner — confirm on D&B's own site. Do not pay a third party for a number
   Google offers free.
4. Expect days to weeks. Make sure the number is tied to the exact legal name and address
   that will go into Play Console.
5. Do not change or delete anything on the Individual account yet.

Related: the owner's contact (Thabo Derrick) was asked on 2026-10-16 to register the company
with D&B, PayFast and Ozow (all need CIPC documents). That email is a draft only; nothing
has been sent from this repo.

## When the number is ready

**Phase 1 — account transition.** Either use the "Change account type" option under
Developer account > About you (*unverified that it still exists*) or create a new
Organization account and run an app transfer. **Decide the package name first** (below).
Keep CIPC details, D-U-N-S profile and Google Payments profile identical.

**Phase 2 — financial compliance.** Complete the Financial Features Declaration under
App content. Prepare the FSCA authorisation upload. **Open question for the owner:** does
TD IT Solution hold its own FSP licence, or act under a licensed insurer's authorisation?
Not known from the repo.

**Phase 3 — store and privacy review.** Review the POPIA privacy policy for secure handling
of financial data; audit the store listing. The personal-loan rules (repayment windows, APR,
contacts/photos permissions) are expected **not** to apply, since this is not a loan app —
confirm during the review.

## Things from this project that affect the plan

- **Package name** cannot change after the first upload and travels with an app transfer.
  Three spellings exist: `co.za.tditsolution.insurance` (Play Console entry),
  `co.za.tditsolutions.insurance` (`mobile/app.json`), and `...insurance.internal` (reported
  from the owner's Play flow). If nothing has reached real users, creating the app fresh
  under the new Organization account may be simpler than a transfer. Decide before Phase 1.
- **INC-002** (location permission) is on HALT awaiting the owner. The Data Safety form
  describes a fuller app than any build produced so far.
- **Feature flags:** until commit `236fa8e` (2026-10-16), mobile builds ignored `eas.json`
  and shipped every gated feature ON (dynamic `process.env` read not inlined by Expo). Do not
  submit any build made before that commit to Play review. The fix has not been device-tested.
- **Compliance floor** (see INC-001/INC-003 and HANDOFF.md): record of processing
  activities, Supabase data-processing agreement, and similar items are still open and bear
  on the privacy policy and Data Safety answers.
