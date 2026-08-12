import { Logo } from '../components/Logo';
import { ChevronMotifField } from './ChevronMotif';

/**
 * Hero brand visual: chevron motif field with centered logo.
 * Page-local — decorative composition for the landing hero.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-sm sm:max-w-md lg:max-w-none">
      <div className="relative">
        <ChevronMotifField className="mx-auto ring-1 ring-slate-900/5" />

        <div className="absolute left-1/2 top-1/2 w-[min(72%,220px)] -translate-x-1/2 -translate-y-1/2">
          <Logo
            tone="navy"
            imageClassName="h-auto w-full object-contain"
            label="TD IT Solution Insurance"
          />
        </div>
      </div>
    </div>
  );
}
