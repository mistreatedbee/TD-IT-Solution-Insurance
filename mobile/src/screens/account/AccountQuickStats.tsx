import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDesignTokens } from '../../theme/designTheme';

export interface AccountQuickStat {
  label: string;
  value: string;
}

/** A row of big-number stats with hairline dividers, for use inside a card. */
export function AccountQuickStats({ items }: { items: AccountQuickStat[] }) {
  const t = useDesignTokens();
  if (items.length === 0) return null;
  return (
    <View style={styles.row}>
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? (
            <View
              style={[
                styles.divider,
                { backgroundColor: t.colors.borderSubtle },
              ]}
            />
          ) : null}
          <View style={styles.item}>
            <Text style={[t.type.displayMd, { color: t.colors.ink }]}>
              {item.value}
            </Text>
            <Text style={[t.type.labelSm, { color: t.colors.inkMuted }]}>
              {item.label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  item: { flex: 1, alignItems: 'center' },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
