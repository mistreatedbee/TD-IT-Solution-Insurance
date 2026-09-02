import React from 'react';
import { Text, View } from 'react-native';
import { accountStyles } from './accountStyles';

export interface AccountQuickStat {
  label: string;
  value: string;
}

export function AccountQuickStats({ items }: { items: AccountQuickStat[] }) {
  if (items.length === 0) return null;

  return (
    <View style={accountStyles.statRow}>
      {items.map((item) => (
        <View key={item.label} style={accountStyles.statChip}>
          <Text style={accountStyles.statValue}>{item.value}</Text>
          <Text style={accountStyles.statLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
