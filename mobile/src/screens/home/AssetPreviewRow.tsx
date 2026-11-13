import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { AssetCard } from '../../design';
import type { AssetTrackingView } from '../../tracking/types';
import { assetCardType, assetFooterLine, assetStatusBadge } from './assetStatus';

export interface AssetPreviewRowProps {
  item: AssetTrackingView;
  /** Kept for call-site compatibility; the design AssetCard has one density. */
  compact?: boolean;
  inset?: boolean;
  isLast?: boolean;
}

/**
 * R5.2: one design AssetCard per asset — type icon, name, StatusBadge from the
 * fixed vocabulary (or none), one footer line, whole card is the tap target.
 * The tracking view carries no serial/registration, so no identifier is shown.
 */
export function AssetPreviewRow({ item }: AssetPreviewRowProps) {
  const router = useRouter();
  const status = assetStatusBadge(item);
  const footer = assetFooterLine(item);

  return (
    <AssetCard
      testID={`asset-preview-${item.assetId}`}
      type={assetCardType(item.assetType)}
      name={item.displayName}
      identifier=""
      status={status}
      footer={footer}
      onPress={() => router.push(`/(app)/assets/${item.assetId}` as Href)}
    />
  );
}
