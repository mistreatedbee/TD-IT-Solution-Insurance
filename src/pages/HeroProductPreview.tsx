import {
  CarIcon,
  LaptopIcon,
  MapPinIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { ChevronMotifField } from './ChevronMotif';

/**
 * Hero product preview — large brand logo plus browser-style dashboard mock.
 */
export function HeroProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
      <div className="relative lg:min-h-[520px]">
        <ChevronMotifField className="pointer-events-none absolute left-1/2 top-1/2 mx-auto hidden w-full max-w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-90 lg:block" />

        {/* Large brand logo — primary hero visual */}
        <div className="relative z-10 flex justify-center px-2 lg:absolute lg:left-0 lg:top-1/2 lg:max-w-[58%] lg:-translate-y-1/2 lg:justify-start lg:px-0">
          <Logo
            tone="navy"
            size="xl"
            label="TD IT Solution Insurance"
            imageClassName="h-auto w-full max-w-[min(100%,640px)] max-h-[min(560px,58vh)] object-contain lg:max-w-[580px]"
          />
        </div>

        {/* Dashboard browser mock */}
        <div className="relative z-20 mx-auto mt-8 w-full max-w-md lg:absolute lg:right-0 lg:top-1/2 lg:mt-0 lg:max-w-[400px] lg:-translate-y-1/2">
          <div className="overflow-hidden rounded-2xl border border-primary/15 bg-white shadow-elevated ring-1 ring-black/[0.04]">
            <div className="flex items-center gap-2 border-b border-primary/10 bg-background-alt px-4 py-3">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              </span>
              <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 truncate rounded-md bg-white px-2 py-1">
                <img
                  src="/logo.png"
                  alt=""
                  aria-hidden="true"
                  className="h-6 w-auto shrink-0 object-contain"
                />
                <span className="truncate text-[11px] text-text-secondary">
                  tditsolutionsinsurance.co.za/dashboard
                </span>
              </div>
            </div>

            <div className="space-y-4 bg-gradient-to-b from-white to-background-alt/60 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                    Customer dashboard
                  </p>
                  <p className="mt-1 font-heading text-lg font-semibold tracking-tight text-primary">
                    Your protected assets
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-gold-tint px-2.5 py-1 text-[10px] font-semibold text-accent-gold-deep">
                  <ShieldCheckIcon className="h-3 w-3" aria-hidden="true" />
                  Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-primary/10 bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                    Registered
                  </p>
                  <p className="mt-1 text-2xl font-bold text-primary">3</p>
                  <p className="text-[11px] text-text-secondary">Insured items</p>
                </div>
                <div className="rounded-xl border border-primary/10 bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                    GPS paired
                  </p>
                  <p className="mt-1 text-2xl font-bold text-primary">2</p>
                  <p className="text-[11px] text-text-secondary">Track-ready</p>
                </div>
              </div>

              <ul className="space-y-2">
                {[
                  { icon: CarIcon, name: 'Toyota Corolla', status: 'Protected', tone: 'text-primary' },
                  { icon: LaptopIcon, name: 'MacBook Pro', status: 'GPS live', tone: 'text-secondary' },
                  { icon: SmartphoneIcon, name: 'iPhone 15', status: 'Protected', tone: 'text-primary' },
                ].map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center gap-3 rounded-xl border border-primary/10 bg-white px-3 py-2.5"
                  >
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-gold-tint text-accent-gold-deep"
                      aria-hidden="true"
                    >
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">{item.name}</p>
                      <p className={`text-[11px] font-medium ${item.tone}`}>{item.status}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2 rounded-xl border border-dashed border-accent-gold-deep/40 bg-accent-gold-tint/30 px-3 py-2.5">
                <MapPinIcon className="h-4 w-4 shrink-0 text-accent-gold-deep" aria-hidden="true" />
                <p className="text-[11px] leading-5 text-text-secondary">
                  Recovery coordination with security partners when an item is reported stolen.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-3 text-center text-[11px] text-text-secondary lg:text-right">
            Illustrative preview — subject to policy terms and activation.
          </p>
        </div>
      </div>
    </div>
  );
}
