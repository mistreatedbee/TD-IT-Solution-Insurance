/**
 * Account deletion request page.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COMPANY_CONTACT } from '../../src/lib/companyContact';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function DeleteAccountScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.title}>Delete account & data</Text>

      <Text style={styles.body}>
        You can request removal of your TD IT Solution Insurance account and associated personal
        data.
      </Text>

      <Text style={styles.body}>
        This request covers your account profile, registered assets, alerts, security-related
        records, and other personal information held in connection with your service use, where
        legally required and operationally feasible.
      </Text>

      <Text style={styles.body}>
        Once you continue, you will be taken to a confirmation page where you can finalise the
        deletion request.
      </Text>

      <View style={styles.emailBox}>
        <Text style={styles.emailLabel}>Contact</Text>
        <Text style={styles.email}>{COMPANY_CONTACT.email}</Text>
      </View>

      <View style={styles.actions}>
        <Button
          variant="primary"
          fullWidth
          onPress={() => router.push('/(auth)/delete-account-confirm' as never)}
        >
          Continue
        </Button>
        <Button variant="secondary" fullWidth onPress={() => router.back()} style={{ marginTop: spacing.md }}>
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
    lineHeight: typography.sizes.base * 1.5,
    marginBottom: spacing.md,
  },
  emailBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    backgroundColor: colors.card,
  },
  emailLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  email: {
    fontSize: typography.sizes.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actions: {
    marginTop: spacing.lg,
  },
});
