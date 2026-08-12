import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { Logo } from '../components/Logo';
import { ArrowLink } from '../components/ArrowLink';
import { COMPANY_CONTACT } from '../lib/companyContact';

/**
 * Minimal, real website-terms-of-use page (not policy wording, not a
 * stub). Per business-requirements.md Section 12.2(b)(2), this may launch
 * genuinely minimal — acceptable-use, liability, governing law, contact —
 * because website terms are a different document from insurance policy
 * wording, which does not exist yet.
 */
export function TermsOfServicePage() {
  return (
    <>
      <Section spacing="compact">
        <Logo href="/" />
      </Section>
      <Section width="narrow">
        <SectionHeading eyebrow="Legal" title="Terms of Service" as="h1" size="lg" />
        <div className="prose mt-8 max-w-none space-y-6 text-base text-text-secondary">
          <p>These terms cover use of this website only. They are not an insurance policy.</p>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Use of this site</h2>
            <p>
              This site provides information about TD IT Solution Insurance, lets you create a
              customer account, and join our pre-launch waitlist. Policy purchase and claims
              submission are not yet available on the web.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">No insurance is in force</h2>
            <p>
              Joining the waitlist or browsing this site does not create, imply, or bind any
              insurance cover. Cover, once available, will be subject to separate policy
              documents, underwriting and claims assessment.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Liability</h2>
            <p>
              This site is provided "as is." We aim for accuracy but make no warranty that
              content is error-free or uninterrupted.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Governing law</h2>
            <p>These terms are governed by the law of the Republic of South Africa.</p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Contact</h2>
            <p>
              Questions about these terms:{' '}
              <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-primary hover:underline">
                {COMPANY_CONTACT.email}
              </a>
              .
            </p>
            <p className="mt-2 text-sm">
              {COMPANY_CONTACT.legalName} · {COMPANY_CONTACT.addressLines.join(', ')}
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
