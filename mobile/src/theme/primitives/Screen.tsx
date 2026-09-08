/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 */
import React, { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { RefreshControlProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTabBarContentInset } from '../../navigation/TabBarInsetContext';
import { useColors } from '../ThemeProvider';
import { spacing } from '../tokens';

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  safeAreaEdges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  refreshControl,
  safeAreaEdges = ['top', 'bottom'],
  style,
  contentContainerStyle,
}: ScreenProps) {
  const colors = useColors();
  const tabBarInset = useTabBarContentInset();

  const scrollBottomInset = useMemo(
    () => ({
      paddingBottom: tabBarInset > 0 ? tabBarInset : spacing.xl,
    }),
    [tabBarInset],
  );

  const content = (
    <View
      style={[
        scroll ? undefined : styles.flex,
        padded ? styles.padded : undefined,
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.canvas }, style]}
      edges={safeAreaEdges}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, scrollBottomInset]}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    flexGrow: 1,
  },
});
