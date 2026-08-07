import React from "react";
import { CarIcon, LaptopIcon, SmartphoneIcon, TabletIcon, TvIcon, BriefcaseIcon, CheckIcon, BoxIcon } from "lucide-react";
export type AssetType = 'vehicle' | 'laptop' | 'phone' | 'tablet' | 'tv' | 'business';
export type AssetBadgeSize = 'sm' | 'md';
export interface AssetBadgeProps {
  /** Asset type to display. Determines the default icon and label. */
  type: AssetType;
  /** Override the default label for the asset type. */
  label?: string;
  /** Optional secondary line, e.g. a count or coverage note. */
  description?: string;
  /** Marks the asset as actively covered. */
  selected?: boolean;
  /** Dims the badge and blocks interaction. */
  disabled?: boolean;
  /** Visual density of the badge. */
  size?: AssetBadgeSize;
  /** When provided, the badge renders as a button. */
  onClick?: () => void;
  className?: string;
}
const ASSET_META: Record<AssetType, {
  icon: BoxIcon;
  label: string;
}> = {
  vehicle: {
    icon: CarIcon,
    label: 'Vehicle'
  },
  laptop: {
    icon: LaptopIcon,
    label: 'Laptop'
  },
  phone: {
    icon: SmartphoneIcon,
    label: 'Phone'
  },
  tablet: {
    icon: TabletIcon,
    label: 'Tablet'
  },
  tv: {
    icon: TvIcon,
    label: 'TV'
  },
  business: {
    icon: BriefcaseIcon,
    label: 'Business equipment'
  }
};
export function AssetBadge({
  type,
  label,
  description,
  selected = false,
  disabled = false,
  size = 'md',
  onClick,
  className = ''
}: AssetBadgeProps) {
  const meta = ASSET_META[type];
  const Icon = meta.icon;
  const interactive = Boolean(onClick) && !disabled;
  const sizing = size === 'sm' ? {
    card: 'gap-2 p-3',
    icon: 'h-8 w-8',
    glyph: 'h-4 w-4',
    text: 'text-xs'
  } : {
    card: 'gap-3 p-4',
    icon: 'h-10 w-10',
    glyph: 'h-5 w-5',
    text: 'text-sm'
  };
  const state = selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900';
  const hover = interactive && !selected ? 'hover:border-slate-400 hover:bg-slate-50' : interactive ? 'hover:bg-slate-800' : '';
  const classes = ['relative flex w-full flex-col items-center justify-center rounded-lg border text-center transition-colors', sizing.card, state, hover, disabled ? 'cursor-not-allowed opacity-50' : '', interactive ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2' : '', className].filter(Boolean).join(' ');
  const content = <>
      {selected && <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white" aria-hidden="true">
          <CheckIcon className="h-3 w-3 text-slate-900" strokeWidth={3} />
        </span>}
      <span className={['flex items-center justify-center rounded-full', sizing.icon, selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'].join(' ')} aria-hidden="true">
        <Icon className={sizing.glyph} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className={`font-medium leading-tight ${sizing.text}`}>
          {label ?? meta.label}
        </span>
        {description && <span className={`text-xs leading-tight ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
            {description}
          </span>}
      </span>
    </>;
  if (onClick) {
    return <button type="button" className={classes} onClick={onClick} disabled={disabled} aria-pressed={selected}>
        {content}
      </button>;
  }
  return <div className={classes} aria-disabled={disabled || undefined}>
      {content}
    </div>;
}