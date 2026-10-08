/**
 * Privacy Notice — minimal real page (signup consent links here).
 * POPIA-aligned full notice is a `compliance-specialist` deliverable, still
 * owed before public app-store release.
 *
 * The theft-report paragraph below is the PDM-9b minimum required before
 * any pilot with real data — see compliance-specialist's finding at
 * docs/features/009-customer-experience-redesign/security-review-security-operations.md
 * Section 10.4. It mirrors, at notice level, the in-app disclosure already
 * shown before a theft report is submitted
 * (`src/screens/recovery/ReportTheftConfirmScreen.tsx`).
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Privacy Notice</Text>
      <Text style={styles.body}>
        TD IT Solution Insurance processes personal information in line with South African data
        protection law (POPIA). This includes account details, asset registration data, and — when
        GPS tracking is enabled in a future release — location information used for recovery
        services.
      </Text>
      <Text style={styles.body}>
        We collect only what we need to provide asset protection and recovery services. A complete
        privacy notice with operator details, retention periods, and your rights will be published
        before public app-store release.
      </Text>
      <Text style={styles.body}>
        If you submit a theft report, we share it to help recover your asset: a short summary of
        the report (without your name or contact details) goes to our panel of contracted
        security partners, so one of them can take your case; the partner who takes your case then
        receives your full report details. These partners are private security companies
        registered with PSIRA and under contract with us — we don&apos;t share report data with
        anyone outside that category.
      </Text>
      <View style={styles.actions}>
        <Button variant="primary" fullWidth onPress={() => router.back()}>
          Back
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.md,
  },
  actions: {
    marginTop: spacing.xl,
  },
});
