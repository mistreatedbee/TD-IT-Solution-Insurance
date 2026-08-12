import { MapPinIcon, ShieldCheckIcon, SmartphoneIcon } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { Logo } from '../components/Logo';
import { ChevronMotif, ChevronMotifField } from './ChevronMotif';

/**
 * Hero right-column visual: brand motif field, logo, and floating value cards.
 * Page-local — decorative composition for the landing hero only.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-8 top-1/2 hidden h-72 w-72 -translate-y-1/2 rounded-full bg-accent-gold/10 blur-3xl lg:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 h-56 w-56 rounded-full bg-primary/5 blur-3xl"
      />

      <div className="relative">
        <ChevronMotifField className="mx-auto shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5" />

        <div className="absolute left-1/2 top-1/2 z-10 w-[min(72%,220px)] -translate-x-1/2 -translate-y-1/2">
          <Logo
            tone="navy"
            imageClassName="h-auto w-full object-contain drop-shadow-sm"
            label="TD IT Solution Insurance"
          />
        </div>

        <GlassCard
          tone="dark"
          padding="sm"
          icon={<SmartphoneIcon className="h-5 w-5" />}
          heading="Report in the app"
          description="Flag a stolen asset in a couple of taps."
          className="absolute -left-2 top-8 z-20 hidden max-w-[12.5rem] sm:block sm:-left-6"
        />
        <GlassCard
          tone="dark"
          padding="sm"
          icon={<MapPinIcon className="h-5 w-5" />}
          heading="GPS-guided recovery"
          description="Location data helps partners act fast."
          className="absolute -right-2 bottom-16 z-20 hidden max-w-[12.5rem] sm:block sm:-right-6"
        />
        <GlassCard
          tone="dark"
          padding="sm"
          icon={<ShieldCheckIcon className="h-5 w-5" />}
          heading="Security partners"
          description="Coordinated, best-effort recovery support."
          className="absolute bottom-2 left-1/2 z-20 hidden max-w-[13rem] -translate-x-1/2 sm:bottom-0 sm:block"
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-4 left-1/2 flex -translate-x-1/2 gap-2 opacity-40"
      >
        <ChevronMotif tone="gold" className="h-4 w-7" />
        <ChevronMotif tone="navy" className="h-4 w-7" />
        <ChevronMotif tone="gold" className="h-4 w-7" />
      </div>
    </div>
  );
}
