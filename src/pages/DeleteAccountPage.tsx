import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { Logo } from '../components/Logo';
import { ArrowLink } from '../components/ArrowLink';
import { COMPANY_CONTACT } from '../lib/companyContact';

export function DeleteAccountPage() {
  return (
    <>
      <Section spacing="compact">
        <Logo href="/" />
      </Section>
      <Section width="narrow">
        <SectionHeading eyebrow="Legal" title="Delete account & data" as="h1" size="lg" />
        <div className="prose mt-8 max-w-none space-y-6 text-base text-text-secondary">
          <p>
            You can request removal of your TD IT Solution Insurance account and associated personal
            data.
          </p>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">What this includes</h2>
            <p>
              This request may cover your account profile, registered assets, alerts, security-related
              records, and other personal information connected to your service use, where legally
              required and operationally feasible.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">How to request</h2>
            <p>
              Email us from the address used to create your account and include your name so we can
              identify and process the request.
            </p>
            <p className="mt-3">
              <a
                href={`mailto:${COMPANY_CONTACT.email}?subject=${encodeURIComponent('Request account and associated data deletion')}`}
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {COMPANY_CONTACT.email}
              </a>
            </p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Important</h2>
            <p>
              Some information may need to be retained where the law requires it, such as records for
              legal, regulatory, or fraud-prevention obligations.
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <ArrowLink href={`mailto:${COMPANY_CONTACT.email}?subject=${encodeURIComponent('Request account and associated data deletion')}`}>
            Email deletion request
          </ArrowLink>
          <ArrowLink href="/privacy" reverse>
            Privacy Policy
          </ArrowLink>
        </div>
      </Section>
    </>
  );
}
