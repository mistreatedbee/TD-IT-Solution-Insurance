import type { CSSProperties } from 'react';
import type { AssetType } from '../AssetBadge';
import { Reveal } from '../Reveal';
import {
  ASSET_COVERAGE_LABELS,
  ASSET_TYPE_IMAGE_SRC,
  COVERAGE_ASSET_ORDER,
  COVERAGE_IMAGE_BOUNDS,
} from '../../lib/asset-type-visuals';

function imageStyle(type: AssetType): CSSProperties {
  const bounds = COVERAGE_IMAGE_BOUNDS[type];
  return {
    maxWidth: bounds.maxWidth,
    maxHeight: bounds.maxHeight,
    width: 'auto',
    height: 'auto',
  };
}

export { COVERAGE_ASSET_ORDER };

export function CoverageAssetsGrid() {
  return (
    <div className="mx-auto mt-10 grid w-full max-w-5xl grid-cols-2 gap-4 sm:gap-[18px] lg:grid-cols-4">
      {COVERAGE_ASSET_ORDER.map((type, index) => (
        <Reveal key={type} delay={index * 0.04} className="h-full">
          <article
            className="flex h-[170px] w-full flex-col overflow-hidden rounded-[14px] border border-primary/10 bg-white shadow-resting"
            aria-label={ASSET_COVERAGE_LABELS[type]}
          >
            <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-1 pt-2.5">
              <img
                src={ASSET_TYPE_IMAGE_SRC[type]}
                alt=""
                className="block object-contain"
                style={imageStyle(type)}
                loading="lazy"
                decoding="async"
              />
            </div>
            <p className="m-0 flex min-h-[44px] flex-shrink-0 items-center justify-center px-3 pb-2.5 text-center text-sm font-semibold leading-tight text-text-primary">
              {ASSET_COVERAGE_LABELS[type]}
            </p>
          </article>
        </Reveal>
      ))}
    </div>
  );
}
