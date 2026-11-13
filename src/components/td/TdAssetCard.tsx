import { Laptop, Car, Smartphone, Tv, Tablet, Monitor, Briefcase, Package, type LucideIcon } from 'lucide-react';
import { cx, TD_FOCUS } from './cx';
import { TdStatusBadge, type TdStatus } from './TdStatusBadge';

/**
 * Icon per asset category. The design-system reference names laptop/car/smartphone/tv; the
 * remaining four cover the API's other asset categories (tablet, desktop, business equipment,
 * other electronics) with the matching Lucide line icon rather than borrowing a wrong one.
 * Flagged to design-system-manager for inclusion in the reference set.
 */
export type TdAssetType = 'laptop' | 'car' | 'smartphone' | 'tv' | 'tablet' | 'desktop' | 'equipment' | 'other';

const ICONS: Record<TdAssetType, LucideIcon> = {
  laptop: Laptop,
  car: Car,
  smartphone: Smartphone,
  tv: Tv,
  tablet: Tablet,
  desktop: Monitor,
  equipment: Briefcase,
  other: Package,
};

/** Returns only the last four characters of a serial or ID (whitespace stripped, upper-cased). */
export function lastFour(value: string): string {
  return value.replace(/\s+/g, '').slice(-4).toUpperCase();
}

export interface TdAssetCardProps {
  type: TdAssetType;
  name: string;
  /** Detail label, e.g. "Serial ending" or "Registration ending". */
  detailLabel?: string;
  /** Full serial/ID. Only the last four characters are ever rendered. */
  identifier: string;
  /** Fixed status vocabulary. Omit when the source status has no honest mapping: no badge is shown. */
  status?: TdStatus;
  /** One line of last-seen or case information; for open cases name the next step. */
  footer: string;
  /** Renders the card as a link to the asset detail. Provide href or onSelect; with neither the card is a static summary. */
  href?: string;
  onSelect?: () => void;
  forceSolid?: boolean;
  className?: string;
}

const SURFACE =
  'grid grid-cols-[48px_1fr_auto] items-center gap-x-td-4 gap-y-td-3 p-td-4 rounded-td-lg border text-left text-td-ink no-underline ';
const GLASS =
  'bg-td-glass-fill border-td-glass-border shadow-[var(--td-shadow-glass)] backdrop-blur-td-glass [@media(prefers-reduced-transparency:reduce)]:bg-td-bg-raised [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none';
const SOLID = 'bg-td-bg-raised border-td-border-subtle shadow-[var(--td-shadow-glass)]';

export function TdAssetCard({
  type,
  name,
  detailLabel = 'Serial ending',
  identifier,
  status,
  footer,
  href,
  onSelect,
  forceSolid = false,
  className,
}: TdAssetCardProps) {
  const Icon = ICONS[type];
  const interactive = Boolean(href || onSelect);
  const cls = cx(SURFACE, forceSolid ? SOLID : GLASS, 'w-full', interactive && TD_FOCUS, className);
  const body = (
    <>
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-td-md bg-td-info-bg text-td-link">
        <Icon strokeWidth={1.75} className="h-6 w-6" />
      </span>
      <span className="block">
        <span className="m-0 block font-td-sans text-[16px] font-bold leading-[22px]">{name}</span>
        <span className="m-0 block font-td-sans text-[13px] leading-[18px] text-td-ink-muted">
          {detailLabel} {lastFour(identifier)}
        </span>
      </span>
      {status ? <TdStatusBadge status={status} /> : <span aria-hidden="true" />}
      <span className="col-span-full border-t border-td-border-subtle pt-td-3 font-td-sans text-[13px] leading-[18px] text-td-ink-muted">
        {footer}
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} className={cls}>
        {body}
      </a>
    );
  }
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <article data-asset-card="static" className={cls}>
      {body}
    </article>
  );
}
