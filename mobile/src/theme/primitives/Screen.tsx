/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 * Do not extend this ad hoc; replace once design-system-manager ships the
 * RN component port (architecture.md §1.5).
 *
 * Full-bleed mobile screen surface — no Card wrapper, per ui-design.md §1:
 * "Mobile app screens do not wrap the form in a Card — the screen
 * background *is* the surface."
 */
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../tokens';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView (default true — most auth forms benefit
   * from this on small devices / with the keyboard open). */
  scroll?: boolean;
  /** Horizontal+vertical padding around content. Default true. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const content = (
    <View
      style={[padded ? styles.padded : undefined, contentContainerStyle]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
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
    backgroundColor: colors.background,
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
