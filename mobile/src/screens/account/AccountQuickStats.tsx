import React from 'react';
import { Text, View } from 'react-native';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { useAccountStyles } from './accountStyles';

export interface AccountQuickStat {
  label: string;
  value: string;
}

export function AccountQuickStats({
  items,
  inline = false,
}: {
  items: AccountQuickStat[];
  /** When true, stats render inside a parent SurfaceGroup (no outer card). */
  inline?: boolean;
}) {
  const accountStyles = useAccountStyles();
  const surfaceStyles = useSurfaceStyles();

  if (items.length === 0) return null;

  if (inline) {
    return (
      <View style={accountStyles.statRowEmbedded}>
        {items.map((item, index) => (
          <React.Fragment key={item.label}>
            {index > 0 ? <View style={surfaceStyles.statDivider} /> : null}
            <View style={surfaceStyles.statItem}>
              <Text style={surfaceStyles.statValue}>{item.value}</Text>
              <Text style={surfaceStyles.statLabel}>{item.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    );
  }

  return (
    <View style={surfaceStyles.statBar}>
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? <View style={surfaceStyles.statDivider} /> : null}
          <View style={surfaceStyles.statItem}>
            <Text style={surfaceStyles.statValue}>{item.value}</Text>
            <Text style={surfaceStyles.statLabel}>{item.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
