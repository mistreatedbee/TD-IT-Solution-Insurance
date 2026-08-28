import { Stack } from 'expo-router';
import { FEATURE_THEFT_REPORTING_ENABLED } from '../../../src/config/features';
import { FeatureUnavailableScreen } from '../../../src/screens/common/FeatureUnavailableScreen';
import { colors } from '../../../src/theme/tokens';

/**
 * INC-001 A-12: theft-report flow creates recovery cases with no Stage 8
 * record on the mobile surface. Guard at layout level.
 */
export default function ReportTheftLayout() {
  if (!FEATURE_THEFT_REPORTING_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Theft reporting is coming soon."
        body="In-app theft reporting is not available in this build yet. If you need urgent help, contact our support team from the Account tab."
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Report theft' }} />
      <Stack.Screen name="confirm" options={{ title: 'Confirm report' }} />
      <Stack.Screen name="success" options={{ title: 'Report submitted', headerBackVisible: false }} />
    </Stack>
  );
}
