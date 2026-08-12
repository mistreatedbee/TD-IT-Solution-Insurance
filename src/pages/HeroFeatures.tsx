import { MapPinIcon, ShieldCheckIcon, SmartphoneIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { Reveal } from '../components/Reveal';
import { StatBlock } from '../components/StatBlock';

const HERO_HIGHLIGHTS = [
  {
    icon: MapPinIcon,
    title: 'GPS-assisted recovery',
    description: 'Location data guides partner-led recovery when an asset is reported stolen.',
  },
  {
    icon: SmartphoneIcon,
    title: 'Report in the app',
    description: 'Flag a lost or stolen item quickly from your phone when it matters most.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Security partners',
    description: 'Coordinated response with trained recovery partners — best-effort, not guaranteed.',
  },
] as const;

function HighlightItem({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background-alt p-4">
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-gold-tint text-primary"
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
    </div>
  );
}

export function HeroFeatures() {
  return (
    <div className="relative mx-auto w-full max-w-7xl space-y-10 px-6 lg:px-8">
      <Reveal>
        <div className="grid gap-4 sm:grid-cols-3">
          {HERO_HIGHLIGHTS.map((item) => (
            <HighlightItem key={item.title} {...item} />
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="grid grid-cols-3 gap-4 border-y border-border py-8 sm:gap-8">
          <StatBlock value={8} suffix="+" label="Asset categories" size="md" animate align="center" />
          <StatBlock value={3} label="Simple steps" size="md" animate align="center" />
          <div className="flex flex-col items-center text-center">
            <p className="text-3xl font-bold leading-none tracking-tight text-primary sm:text-4xl">Monthly</p>
            <span aria-hidden="true" className="mt-4 block h-1 w-10 rounded-full bg-accent-gold-deep" />
            <span className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary sm:text-sm">
              Per asset billing
            </span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
