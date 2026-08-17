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
import React from 'react';
import { View } from 'react-native';
import { DraggableAssistFab } from '../../src/navigation/DraggableAssistFab';
import { FloatingTabBar } from '../../src/navigation/FloatingTabBar';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../src/navigation/tabBarMetrics';
import { useLocationReporter } from '../../src/location/useLocationReporter';
import { usePushNotifications } from '../../src/notifications/usePushNotifications';
import { useNotificationDeepLinks } from '../../src/notifications/useNotificationDeepLinks';
import { colors } from '../../src/theme/tokens';

export default function AppTabsLayout() {
  usePushNotifications();
  useNotificationDeepLinks();
  useLocationReporter();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => (
          <FloatingTabBar
            state={props.state}
            navigation={props.navigation as never}
          />
        )}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          sceneStyle: { backgroundColor: colors.slate[50], paddingBottom: FLOATING_TAB_BAR_CLEARANCE },
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: 'Assets',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          headerShown: false,
          sceneStyle: { backgroundColor: colors.slate[100], paddingBottom: 0 },
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          headerShown: false,
        }}
      />
      <Tabs.Screen name="policy" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen
        name="mfa-enroll"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen name="notification-preferences" options={{ href: null }} />
      <Tabs.Screen name="report-theft" options={{ href: null }} />
      <Tabs.Screen name="claims" options={{ href: null }} />
      <Tabs.Screen name="live-tracking" options={{ href: null }} />
      <Tabs.Screen name="device-locations" options={{ href: null }} />
      </Tabs>
      <DraggableAssistFab />
    </View>
  );
}
