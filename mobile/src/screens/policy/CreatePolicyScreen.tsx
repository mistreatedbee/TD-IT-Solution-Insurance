/**
 * Create policy — POST /v1/policies with Idempotency-Key.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCreatePolicyMutation } from '../../api/hooks/usePolicies';
import { ApiError } from '../../api/errors';
import { Alert, Button, Input, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export function CreatePolicyScreen() {
  const router = useRouter();
  const createMutation = useCreatePolicyMutation();
  const [planTier, setPlanTier] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function handleSubmit() {
    const trimmed = planTier.trim();
    if (!trimmed) {
      setFieldError('Enter a plan tier label.');
      return;
    }
    setFieldError(undefined);

    try {
      const policy = await createMutation.mutateAsync({ planTier: trimmed });
      if (policy.id) {
        router.replace(`/policy/${policy.id}` as Href);
      } else {
        router.back();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
        setFieldError('Your account must be verified and active before creating a policy.');
      }
    }
  }

  const submitError =
    createMutation.error instanceof ApiError && createMutation.error.code !== 'ACCOUNT_NOT_ACTIVE'
      ? createMutation.error.message
      : createMutation.error instanceof Error && !(createMutation.error instanceof ApiError)
        ? createMutation.error.message
        : undefined;

  return (
    <Screen>
      <Text style={styles.title}>Create policy</Text>
      <Text style={styles.body}>
        Plan tiers are not finalized yet — enter the tier name you were given (for example
        &quot;standard&quot; or &quot;premium&quot;). Coverage limits and pricing will be
        configured later.
      </Text>

      {submitError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{submitError}</Alert>
        </View>
      ) : null}

      <Input
        label="Plan tier"
        value={planTier}
        onChangeText={setPlanTier}
        placeholder="e.g. standard"
        error={fieldError}
        required
        autoCapitalize="none"
      />

      <Button fullWidth loading={createMutation.isPending} onPress={handleSubmit}>
        Create policy
      </Button>
      <Button variant="tertiary" onPress={() => router.back()}>
        Cancel
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
    marginBottom: spacing.xl,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
});
