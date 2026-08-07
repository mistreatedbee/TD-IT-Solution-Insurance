import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { Logo } from '../components/Logo';
import { ArrowLink } from '../components/ArrowLink';

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
            This policy currently covers the one thing this site collects: the optional waitlist
            sign-up form on our homepage.
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
              We won't send you marketing, and we won't share or sell your details to anyone
              else. Joining the waitlist is not an application for insurance and does not create
              any policy or contract.
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
              [SUPPORT EMAIL — pending]. We handle personal information under the Protection of
              Personal Information Act 4 of 2013 (POPIA).
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
