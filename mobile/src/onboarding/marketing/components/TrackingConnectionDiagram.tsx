import { ArrowDownIcon, MapPinIcon, SmartphoneIcon, ShieldIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../brand/constants';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const NODES = [
  { label: 'Your asset', Icon: ShieldIcon },
  { label: 'Tracking device', Icon: MapPinIcon },
  { label: 'TD IT Solution Insurance platform', Icon: ShieldIcon },
  { label: 'Your mobile app', Icon: SmartphoneIcon },
] as const;

export function TrackingConnectionDiagram() {
  return (
    <View style={styles.wrap} accessibilityLabel="How tracking connects to your app">
      {NODES.map((node, index) => (
        <View key={node.label} style={styles.block}>
          <View style={styles.node}>
            <node.Icon size={22} color={BRAND.secondary} />
            <Text style={styles.nodeLabel}>{node.label}</Text>
          </View>
          {index < NODES.length - 1 ? (
            <View style={styles.connector}>
              <ArrowDownIcon size={20} color={colors.slate[400]} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: spacing.lg,
    alignItems: 'stretch',
  },
  block: { alignItems: 'center' },
  node: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignSelf: 'stretch',
  },
  nodeLabel: {
    flex: 1,
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  connector: {
    paddingVertical: spacing.xs,
  },
});
