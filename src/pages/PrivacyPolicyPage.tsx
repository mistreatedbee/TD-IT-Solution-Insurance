import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { Logo } from '../components/Logo';
import { ArrowLink } from '../components/ArrowLink';
import { COMPANY_CONTACT } from '../lib/companyContact';

/**
 * Minimal, real (not "coming soon") Privacy Policy page.
 *
 * Scope is deliberately narrow: it describes only the processing this
 * feature actually does today (the waitlist form's email/name capture),
 * per compliance-specialist's guidance in business-requirements.md
 * Section 12.3.3 ("a short, accurate policy is strongly preferred over a
 * long, aspirational, copy-pasted one that describes processing that does
 * not yet happen"). This is not a substitute for full legal review — it
 * exists so the footer/waitlist-form Privacy Policy link is never a dead
 * link or a "coming soon" stub, per Section 12.2(b)(2)/(3).
 *
 * This page also doubles as the account-signup privacy notice
 * (`CustomerSignupPage.tsx`'s consent link). The "Theft reports" section
 * below is the PDM-9b minimum required before any pilot with real data —
 * see compliance-specialist's finding at
 * docs/features/009-customer-experience-redesign/security-review-security-operations.md
 * Section 10.4. It is deliberately a minimum (category-level disclosure,
 * matching the in-app notice already shown before a theft report is
 * submitted), not the full POPIA notice this policy still owes.
 */
export function PrivacyPolicyPage() {
  return (
    <>
      <Section spacing="compact">
        <Logo href="/" />
      </Section>
      <Section width="narrow">
        <SectionHeading eyebrow="Legal" title="Privacy Policy" as="h1" size="lg" />
        <div className="prose mt-8 max-w-none space-y-6 text-base text-text-secondary">
          <p>
            This policy currently covers the waitlist sign-up form on our homepage, and — for
            customer account holders — what happens to a theft report you submit. It does not yet
            cover every type of processing an account involves; that fuller notice is still being
            built.
          </p>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">What we collect</h2>
            <p>Your email address, and your name if you choose to give it.</p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Why we collect it</h2>
            <p>So we can email you once, to let you know when TD IT Solution Insurance launches.</p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">What we don't do</h2>
            <p>
              We won't send you marketing, and we won't sell your details to anyone. Joining the
              waitlist is not an application for insurance and does not create any policy or
              contract. We also don't share waitlist details with anyone else — see "Theft
              reports" below for the one thing account holders' data is shared for.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Theft reports</h2>
            <p>
              If you have a customer account and submit a theft report, we share it to help
              recover your asset. A short summary of the report (without your name or contact
              details) goes to our panel of contracted security partners, so one of them can take
              your case. The partner who takes your case then receives your full report details,
              including anything you typed into it. These partners are private security companies
              registered with PSIRA and under contract with us — we don't share report data with
              anyone outside that category.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">How long we keep it</h2>
            <p>
              We delete waitlist entries within 12 months of collection, or within 90 days of
              sending the launch notification email, whichever happens first.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Your rights</h2>
            <p>
              You can ask us to delete your details at any time by contacting{' '}
              <a
                href={`mailto:${COMPANY_CONTACT.email}?subject=${encodeURIComponent('Account and data deletion request')}`}
                className="text-primary hover:underline"
              >
                {COMPANY_CONTACT.email}
              </a>
              . We handle personal information under the Protection of
              Personal Information Act 4 of 2013 (POPIA).
            </p>
            <p className="mt-3">
              <a
                href={`mailto:${COMPANY_CONTACT.email}?subject=${encodeURIComponent('Request account and associated data deletion')}`}
                className="inline-flex items-center text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Request account and data deletion
              </a>
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">This policy will grow</h2>
            <p>
              As we build out account creation, policy administration, GPS-assisted recovery and
              payments, this policy will be expanded to cover that processing before those
              features go live — not before.
            </p>
          </div>
        </div>
        <div className="mt-10">
          <ArrowLink href="/" reverse>
            Back to home
          </ArrowLink>
        </div>
      </Section>
    </>
  );
}
