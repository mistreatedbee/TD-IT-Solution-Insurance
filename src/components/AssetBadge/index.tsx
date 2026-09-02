import { CheckIcon, type LucideIcon } from 'lucide-react';
import { CarIcon, LaptopIcon, SmartphoneIcon, TabletIcon, TvIcon, BriefcaseIcon, MonitorIcon, CpuIcon } from 'lucide-react';
import { AssetTypeImage } from '../AssetTypeImage';
import { ASSET_TYPE_IMAGE_SRC, ASSET_TYPE_SURFACE_CLASS } from '../../lib/asset-type-visuals';

export type AssetType = 'vehicle' | 'laptop' | 'phone' | 'tablet' | 'tv' | 'business' | 'desktop' | 'other';
export type AssetBadgeSize = 'sm' | 'md';

export interface AssetBadgeProps {
  type: AssetType;
  label?: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  size?: AssetBadgeSize;
  /** When false, falls back to the legacy icon chip (e.g. tiny inline uses). */
  showImage?: boolean;
  onClick?: () => void;
  className?: string;
}

const ASSET_META: Record<AssetType, { icon: LucideIcon; label: string }> = {
  vehicle: { icon: CarIcon, label: 'Vehicle' },
  laptop: { icon: LaptopIcon, label: 'Laptop' },
  phone: { icon: SmartphoneIcon, label: 'Phone' },
  tablet: { icon: TabletIcon, label: 'Tablet' },
  tv: { icon: TvIcon, label: 'TV' },
  business: { icon: BriefcaseIcon, label: 'Business equipment' },
  desktop: { icon: MonitorIcon, label: 'Desktop computer' },
  other: { icon: CpuIcon, label: 'Other electronics' },
};

export function AssetBadge({
  type,
  label,
  description,
  selected = false,
  disabled = false,
  size = 'md',
  showImage = true,
  onClick,
  className = '',
}: AssetBadgeProps) {
  const meta = ASSET_META[type];
  const Icon = meta.icon;
  const interactive = Boolean(onClick) && !disabled;
  const displayLabel = label ?? meta.label;

  const baseCard = [
    'relative flex w-full flex-col overflow-hidden rounded-xl border text-left transition-all duration-200',
    selected
      ? 'border-primary bg-primary text-white shadow-md ring-2 ring-primary/20'
      : 'border-primary/10 bg-white text-text-primary shadow-resting hover:shadow-hover',
    disabled ? 'cursor-not-allowed opacity-50' : '',
    interactive && !disabled
      ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const imagePanelClass = [
    'relative flex w-full items-center justify-center bg-gradient-to-b',
    ASSET_TYPE_SURFACE_CLASS[type],
    size === 'sm' ? 'aspect-[5/4] p-2' : 'aspect-[4/3] p-3 sm:p-4',
    selected ? 'opacity-95' : '',
  ].join(' ');

  const content = showImage ? (
    <>
      {selected ? (
        <span
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white text-primary shadow-sm"
          aria-hidden="true"
        >
          <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : null}
      <div className={imagePanelClass}>
        <img
          src={ASSET_TYPE_IMAGE_SRC[type]}
          alt=""
          className="max-h-full max-w-full object-contain drop-shadow-md"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className={size === 'sm' ? 'px-2.5 py-2 text-center' : 'px-3 py-3 text-center'}>
        <span className={`block font-semibold leading-tight ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
          {displayLabel}
        </span>
        {description ? (
          <span
            className={`mt-0.5 block text-xs leading-tight ${
              selected ? 'text-white/75' : 'text-text-secondary'
            }`}
          >
            {description}
          </span>
        ) : null}
      </div>
    </>
  ) : (
    <div className={`flex flex-col items-center justify-center gap-3 p-4 text-center ${size === 'sm' ? 'gap-2 p-3' : ''}`}>
      {selected && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white" aria-hidden="true">
          <CheckIcon className="h-3 w-3 text-slate-900" strokeWidth={3} />
        </span>
      )}
      <span
        className={[
          'flex items-center justify-center rounded-full',
          size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
          selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700',
        ].join(' ')}
        aria-hidden="true"
      >
        <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
      </span>
      <span className="flex flex-col gap-0.5 text-center">
        <span className={`font-medium leading-tight ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
          {displayLabel}
        </span>
        {description && (
          <span className={`text-xs leading-tight ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
            {description}
          </span>
        )}
      </span>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={baseCard}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={displayLabel}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseCard} aria-disabled={disabled || undefined}>
      {content}
    </div>
  );
}

/** Compact inline thumbnail — product photo in a soft tinted frame. */
export function AssetTypeThumbnail({
  type,
  size = 'sm',
  className = '',
}: {
  type: AssetType;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  return <AssetTypeImage type={type} size={size} className={className} />;
}
