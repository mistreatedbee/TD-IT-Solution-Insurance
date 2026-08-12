import { CheckIcon, type LucideIcon } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';

export interface PlanTierCardProps {
  name: string;
  tagline: string;
  icon: LucideIcon;
  features: readonly string[];
  featured?: boolean;
  badge?: string;
  onNotify?: () => void;
}

export function PlanTierCard({
  name,
  tagline,
  icon: Icon,
  features,
  featured = false,
  badge,
  onNotify,
}: PlanTierCardProps) {
  return (
    <article
      className={[
        'relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-resting transition-all duration-300',
        featured
          ? 'z-10 border-accent-gold/50 shadow-elevated ring-2 ring-accent-gold/25 lg:-translate-y-2'
          : 'border-border hover:border-accent-gold/30 hover:shadow-elevated',
      ].join(' ')}
    >
      {/* Top accent — replaces corner chevrons that overlapped card content */}
      <div
        aria-hidden="true"
        className={[
          'h-1.5 w-full',
          featured
            ? 'bg-gradient-to-r from-primary via-accent-gold-deep to-accent-gold'
            : 'bg-gradient-to-r from-slate-200 via-slate-100 to-transparent',
        ].join(' ')}
      />

      {featured && badge ? (
        <div className="absolute right-4 top-5">
          <Badge tone="gold" size="sm">
            {badge}
          </Badge>
        </div>
      ) : null}

      <div className="relative z-10 flex flex-1 flex-col p-6 lg:p-7">
        <div className="flex items-start gap-4">
          <span
            className={[
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
              featured
                ? 'bg-gradient-to-br from-primary to-accent-gold-deep text-white shadow-md shadow-primary/20'
                : 'bg-accent-gold-tint text-primary',
            ].join(' ')}
            aria-hidden="true"
          >
            <Icon className="h-6 w-6" />
          </span>
          <div className={featured ? 'min-w-0 pr-16' : 'min-w-0'}>
            <h3 className="text-xl font-semibold tracking-tight text-text-primary">{name}</h3>
            <p className="mt-1 text-sm leading-6 text-text-secondary">{tagline}</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Monthly pricing
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-primary">
            Finalizing at launch
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">Per registered asset · billed monthly</p>
        </div>

        <ul className="mt-6 flex flex-1 flex-col gap-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-text-secondary">
              <span
                className={[
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                  featured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                ].join(' ')}
                aria-hidden="true"
              >
                <CheckIcon className="h-3 w-3" strokeWidth={3} />
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-8 border-t border-slate-100 pt-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Badge tone={featured ? 'gold' : 'neutral'} size="sm">
              Coming soon
            </Badge>
            <span className="text-xs text-text-secondary">No commitment today</span>
          </div>
          <Button
            variant={featured ? 'primary' : 'secondary'}
            size="md"
            fullWidth
            onClick={onNotify}
          >
            Notify me at launch
          </Button>
        </div>
      </div>

      {featured ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-accent-gold/10 blur-2xl"
        />
      ) : null}
    </article>
  );
}
