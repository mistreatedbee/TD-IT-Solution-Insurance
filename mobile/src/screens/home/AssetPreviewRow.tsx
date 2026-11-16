import React from 'react';
import type { AssetTrackingView } from '../../tracking/types';
import { AssetImageCard } from '../assets/AssetImageCard';

export interface AssetPreviewRowProps {
  item: AssetTrackingView;
  /** Kept for call-site compatibility; there is one density. */
  compact?: boolean;
  inset?: boolean;
  isLast?: boolean;
}

/**
 * One glass card per asset on home: the asset's picture, name, type, the fixed StatusBadge (or none) and one
 * footer line; the whole card is the tap target. Uses the same card as the Protection vault so the two lists
 * match. The design AssetCard (small line icon, no picture) is no longer used here: customers recognise their
 * items by the picture. The tracking view carries no serial or registration, so no identifier is shown.
 */
export function AssetPreviewRow({ item }: AssetPreviewRowProps) {
  return <AssetImageCard item={item} />;
}
