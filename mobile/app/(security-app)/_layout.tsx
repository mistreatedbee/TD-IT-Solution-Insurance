/**
 * Tab navigator for the security partner app shell.
 */
import { Tabs } from 'expo-router';
import { ClipboardListIcon, UserIcon } from 'lucide-react-native';
import React from 'react';
import { FEATURE_SECURITY_OPERATOR_ENABLED } from '../../src/config/features';
import { FeatureUnavailableScreen } from '../../src/screens/common/FeatureUnavailableScreen';
import { colors } from '../../src/theme/tokens';
import { usePushNotifications } from '../../src/notifications/usePushNotifications';
import { useNotificationDeepLinks } from '../../src/notifications/useNotificationDeepLinks';

/**
 * INC-001 A-12: the security-operator portal shipped with no Stage 8 record.
 */
export default function SecurityAppTabsLayout() {
  usePushNotifications();
  useNotificationDeepLinks();

  if (!FEATURE_SECURITY_OPERATOR_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Operator portal is coming soon."
        body="The security partner app is not available in this build yet. Please use the web dashboard or contact your account manager."
      />
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.slate[400],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Cases',
          tabBarIcon: ({ color, size }) => <ClipboardListIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="cases/[caseId]" options={{ href: null }} />
      <Tabs.Screen name="tracking/[caseId]" options={{ href: null }} />
      <Tabs.Screen name="notification-preferences" options={{ href: null }} />
    </Tabs>
  );
}
