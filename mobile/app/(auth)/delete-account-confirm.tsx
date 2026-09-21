/**
 * Final account deletion confirmation screen.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { COMPANY_CONTACT } from '../../src/lib/companyContact';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

export default function DeleteAccountConfirmScreen() {
  const router = useRouter();

  function handleConfirmDelete() {
    Alert.alert(
      'Delete account?',
      'This will request the removal of your account and associated data. You can also cancel if you do not want to proceed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            const subject = encodeURIComponent('Request account and associated data deletion');
            const body = encodeURIComponent(
              'Please delete my TD IT Solution Insurance account and all associated personal data linked to my profile, assets, alerts, and device records.\n\nName:\nEmail used to sign in:\n\nPlease confirm once the deletion is complete.',
            );
            void Linking.openURL(`mailto:${COMPANY_CONTACT.email}?subject=${subject}&body=${body}`);
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Confirm deletion</Text>

      <Text style={styles.body}>
        This action requests that your account and associated personal data be removed from TD IT
        Solution Insurance services where legally required and operationally feasible.
      </Text>

      <Text style={styles.body}>
        This may include your profile, device records, alerts, policy details, and related account
        information associated with the service.
      </Text>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>Important</Text>
        <Text style={styles.warningText}>
          Some information may be kept where the law requires us to retain it, such as records needed
          for legal, regulatory, or fraud-prevention obligations.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button variant="primary" fullWidth onPress={handleConfirmDelete}>
          Delete my account
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
  warningBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    backgroundColor: colors.card,
  },
  warningTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  warningText: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.5,
  },
  actions: {
    marginTop: spacing.lg,
  },
});
