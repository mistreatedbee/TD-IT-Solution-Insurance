import type { AssetType } from './AssetBadge';
import {
  ASSET_TYPE_IMAGE_SRC,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_SURFACE_CLASS,
} from '../lib/asset-type-visuals';

export type AssetTypeImageSize = 'xs' | 'sm' | 'md' | 'lg' | 'hero';

export interface AssetTypeImageProps {
  type: AssetType;
  size?: AssetTypeImageSize;
  alt?: string;
  className?: string;
}

const SIZE_CLASS: Record<AssetTypeImageSize, string> = {
  xs: 'h-10 w-10 rounded-lg p-1',
  sm: 'h-14 w-14 rounded-xl p-1.5',
  md: 'h-[4.5rem] w-[4.5rem] rounded-xl p-2',
  lg: 'h-24 w-24 rounded-2xl p-2.5',
  hero: 'h-32 w-full max-w-[12rem] rounded-2xl p-3',
};

export function AssetTypeImage({
  type,
  size = 'md',
  alt,
  className = '',
}: AssetTypeImageProps) {
  const label = alt ?? ASSET_TYPE_LABELS[type];
  const surface = ASSET_TYPE_SURFACE_CLASS[type];

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center bg-gradient-to-b shadow-inner ring-1 ring-primary/5',
        surface,
        SIZE_CLASS[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        src={ASSET_TYPE_IMAGE_SRC[type]}
        alt={label}
        className="h-full w-full object-contain drop-shadow-sm"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

export { ASSET_TYPE_IMAGE_SRC, ASSET_TYPE_LABELS, ASSET_TYPE_SURFACE_CLASS };
