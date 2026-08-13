/**
 * Tab navigator for the authenticated app shell.
 *
 * architecture.md §0/M-03: no ux-researcher/ui-designer Stage 3/4 pass has
 * run yet on this shell's information architecture (tab layout, home
 * composition) — this is an architecture-level scaffold sufficient to
 * host the placeholder screens below, not a researched-and-approved IA.
 * Flagged, not silently presented as final.
 */
import { Tabs } from 'expo-router';
import { HomeIcon, ShieldIcon, PackageIcon, UserIcon } from 'lucide-react-native';
import React from 'react';
import { colors } from '../../src/theme/tokens';
import { usePushNotifications } from '../../src/notifications/usePushNotifications';
import { useNotificationDeepLinks } from '../../src/notifications/useNotificationDeepLinks';

export default function AppTabsLayout() {
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
          title: 'Home',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="policy"
        options={{
          title: 'Policy',
          tabBarIcon: ({ color, size }) => <ShieldIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: 'Assets',
          tabBarIcon: ({ color, size }) => <PackageIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="mfa-enroll"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen name="report-theft" options={{ href: null }} />
      <Tabs.Screen name="claims" options={{ href: null }} />
      <Tabs.Screen name="live-tracking" options={{ href: null }} />
    </Tabs>
  );
}
