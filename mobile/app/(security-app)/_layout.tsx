/**
 * Tab navigator for the security partner app shell.
 */
import { Tabs } from 'expo-router';
import { ClipboardListIcon, UserIcon } from 'lucide-react-native';
import React from 'react';
import { colors } from '../../src/theme/tokens';
import { usePushNotifications } from '../../src/notifications/usePushNotifications';
import { useNotificationDeepLinks } from '../../src/notifications/useNotificationDeepLinks';

export default function SecurityAppTabsLayout() {
  usePushNotifications();
  useNotificationDeepLinks();

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
