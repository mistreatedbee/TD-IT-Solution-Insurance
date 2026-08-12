import { ChevronMotifField } from './ChevronMotif';

/**
 * Hero right-column visual: brand chevron motif field only (desktop).
 * Page-local — decorative composition per ui-design-v2.md §1.
 */
export function HeroVisual() {
  return (
    <div className="relative hidden w-full max-w-md lg:block lg:max-w-none">
      <ChevronMotifField className="mx-auto" />
    </div>
  );
}
