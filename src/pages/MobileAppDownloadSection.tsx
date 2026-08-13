import { SmartphoneIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { SectionHeading } from '../components/SectionHeading';
import { Reveal } from '../components/Reveal';
import { MOBILE_APP, hasMobileStoreLinks } from '../lib/mobileAppLinks';

function StoreBadge({
  label,
  href,
  platform,
}: {
  label: string;
  href: string;
  platform: 'ios' | 'android';
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[52px] min-w-[200px] flex-col justify-center rounded-xl border border-border bg-white px-5 py-3 shadow-resting transition hover:border-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold-deep focus-visible:ring-offset-2"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        {platform === 'ios' ? 'Download on the' : 'Get it on'}
      </span>
      <span className="text-base font-bold text-text-primary">{label}</span>
    </a>
  );
}

export function MobileAppDownloadSection() {
  const storeLinksAvailable = hasMobileStoreLinks();

  return (
    <section id="mobile-app" className="scroll-mt-20 border-t border-border bg-background-alt">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <SectionHeading
                align="left"
                eyebrow="Mobile app"
                title="Download the Mobile Asset Tracking App"
                subtitle="Register assets, view your policy, and report theft from your phone — with GPS-assisted recovery when tracking hardware is paired."
              />
              {!storeLinksAvailable ? (
                <p className="mt-4 max-w-xl text-sm text-text-secondary">
                  App Store and Google Play links will appear here as soon as internal testing
                  completes. Create an account on the web now — your login works in the mobile app
                  too.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 sm:flex-row lg:flex-col xl:flex-row">
              {MOBILE_APP.iosStoreUrl ? (
                <StoreBadge label="App Store" href={MOBILE_APP.iosStoreUrl} platform="ios" />
              ) : null}
              {MOBILE_APP.androidStoreUrl ? (
                <StoreBadge label="Google Play" href={MOBILE_APP.androidStoreUrl} platform="android" />
              ) : null}
              {!storeLinksAvailable ? (
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                  <Link to="/get-started" className="sm:w-auto">
                    <Button variant="primary" size="lg" fullWidth leadingIcon={<SmartphoneIcon className="h-5 w-5" />}>
                      Get Started
                    </Button>
                  </Link>
                  <Link to="/login" className="sm:w-auto">
                    <Button variant="secondary" size="lg" fullWidth>
                      Log in
                    </Button>
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
