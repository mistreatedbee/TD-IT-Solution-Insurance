/**
 * A solid design card that holds a list of rows (replaces SurfaceGroup on the Account screen).
 * Rows carry their own vertical padding and dividers; the card supplies the edge and padding.
 */
import React from 'react';
import { GlassCard } from '../../design';

export function AccountGroup({ children }: { children: React.ReactNode }) {
  return <GlassCard variant="solid">{children}</GlassCard>;
}
