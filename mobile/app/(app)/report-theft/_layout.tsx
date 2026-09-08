import { Stack } from 'expo-router';
import React from 'react';
import { usePlanEntitlements } from '../../../src/api/hooks/usePlanEntitlements';
import { FEATURE_THEFT_REPORTING_ENABLED } from '../../../src/config/features';
import { FeatureUnavailableScreen } from '../../../src/screens/common/FeatureUnavailableScreen';
import { PlanFeatureGateScreen } from '../../../src/screens/plan/PlanFeatureGateScreen';
import { useAppStackScreenOptions } from '../../../src/navigation/useAppStackScreenOptions';
import { ActivityIndicator, View } from 'react-native';
import { useColors } from '../../../src/theme/ThemeProvider';

function ReportTheftStack() {
  const screenOptions = useAppStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Report theft' }} />
      <Stack.Screen name="confirm" options={{ title: 'Confirm report' }} />
      <Stack.Screen name="success" options={{ title: 'Report submitted', headerBackVisible: false }} />
    </Stack>
  );
}

function ReportTheftEntitlementGate() {
  const { hasIncidentManagement, isLoading } = usePlanEntitlements();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!hasIncidentManagement) {
    return <PlanFeatureGateScreen feature="incidentManagement" />;
  }

  return <ReportTheftStack />;
}

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

  return <ReportTheftEntitlementGate />;
}
