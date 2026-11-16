/**
 * Page ground for restyled screens (design-system rollout): the gradient Backdrop behind a transparent Screen,
 * exactly as the restyled home does. Text on these screens always sits on a GlassCard or solid card, never
 * directly on the backdrop.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Backdrop } from '../design';
import { Screen } from '../theme/primitives';

export function DesignPage({ children, ...screenProps }: React.ComponentProps<typeof Screen>) {
  return (
    <View style={styles.fill} testID="design-page">
      <Backdrop variant="gradient" />
      <Screen {...screenProps} style={styles.transparent}>
        {children}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
});
