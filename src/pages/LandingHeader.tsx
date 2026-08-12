import { MenuIcon, PhoneIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Section } from '../components/Section';
import { COMPANY_CONTACT } from '../lib/companyContact';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#coverage', label: 'Coverage' },
  { href: '#plans', label: 'Plans' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact' },
] as const;

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <Section
      as="header"
      spacing="none"
      className={`sticky top-0 z-50 transition-[box-shadow,background-color,border-color] duration-200 ${
        scrolled
          ? 'border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md'
          : 'border-b border-transparent bg-white/70 backdrop-blur-sm'
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
        <Logo variant="full" tone="navy" size="lg" href="/" />

        <nav
          className="hidden items-center gap-1 xl:flex"
          aria-label="Primary"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-100 hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={COMPANY_CONTACT.phones[0].href}
            className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-slate-100 hover:text-text-primary lg:inline-flex"
          >
            <PhoneIcon className="h-4 w-4 text-accent-gold-deep" aria-hidden="true" />
            {COMPANY_CONTACT.phones[0].display}
          </a>
          <Badge tone="gold" size="sm" className="hidden lg:inline-flex">
            Pre-launch
          </Badge>
          <Link to="/login">
            <Button variant="secondary" size="sm">
              Log in
            </Button>
          </Link>
          <Link to="/signup">
            <Button variant="primary" size="sm">
              Sign up
            </Button>
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-text-primary md:hidden"
          aria-expanded={mobileOpen}
          aria-controls="landing-mobile-nav"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div
          id="landing-mobile-nav"
          className="border-t border-slate-200/80 bg-white md:hidden"
        >
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4" aria-label="Primary mobile">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-3 text-base font-medium text-text-primary hover:bg-slate-50"
                onClick={closeMobile}
              >
                {link.label}
              </a>
            ))}
            <a
              href={COMPANY_CONTACT.phones[0].href}
              className="mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-3 text-base font-medium text-text-primary hover:bg-slate-50"
              onClick={closeMobile}
            >
              <PhoneIcon className="h-4 w-4 text-accent-gold-deep" aria-hidden="true" />
              Call {COMPANY_CONTACT.phones[0].display}
            </a>
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
              <Link to="/login" onClick={closeMobile}>
                <Button variant="secondary" size="md" fullWidth>
                  Log in
                </Button>
              </Link>
              <Link to="/signup" onClick={closeMobile}>
                <Button variant="primary" size="md" fullWidth>
                  Sign up
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </Section>
  );
}
