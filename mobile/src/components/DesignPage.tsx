/**
 * Page ground for restyled screens (design-system rollout): the gradient Backdrop behind a transparent Screen,
 * exactly as the restyled home does. Text on these screens always sits on a GlassCard or solid card, never
 * directly on the backdrop.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Backdrop } from '../design';
import { Screen } from '../theme/primitives';

export type DesignPageProps = React.ComponentProps<typeof Screen> & {
  /** Tab-root pages: the tab shell already draws one full-screen gradient behind every tab, so skip a second one. */
  sharedBackdrop?: boolean;
};

export function DesignPage({ children, sharedBackdrop = false, ...screenProps }: DesignPageProps) {
  return (
    <View style={styles.fill} testID="design-page">
      {sharedBackdrop ? null : <Backdrop variant="gradient" />}
      <Screen {...screenProps} backdrop={false} style={styles.transparent}>
        {children}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
});
