import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import {
  FEATURE_ALERTS_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
} from '../../../src/config/features';
import { TabBarInsetProvider } from '../../../src/navigation/TabBarInsetContext';
import { FloatingTabBar } from '../../../src/navigation/FloatingTabBar';
import { useMapTabSceneStyle, useTabSceneStyle } from '../../../src/navigation/tabBarMetrics';

/**
 * Tab navigator for the authenticated app shell.
 */
export default function AppTabsLayout() {
  const tabSceneStyle = useTabSceneStyle();
  const mapTabSceneStyle = useMapTabSceneStyle();

  return (
    <TabBarInsetProvider>
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
            sceneStyle: tabSceneStyle,
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false }} />
          <Tabs.Screen name="assets" options={{ title: 'Assets', headerShown: false }} />
          <Tabs.Screen
            name="map"
            options={{
              title: 'Map',
              headerShown: false,
              href: FEATURE_LOCATION_TRACKING_ENABLED ? undefined : null,
              sceneStyle: mapTabSceneStyle,
            }}
          />
          <Tabs.Screen
            name="alerts"
            options={{
              title: 'Alerts',
              headerShown: false,
              href: FEATURE_ALERTS_ENABLED ? undefined : null,
            }}
          />
          <Tabs.Screen name="account" options={{ title: 'Account', headerShown: false }} />
        </Tabs>
        {/* AI assistant is not built (button only showed a "coming soon" alert, overlapped content and
            offered nothing to a stressed user — mobile-ui-ux-review.md). Re-mount <DraggableAssistFab />
            here only once a real assistant exists and has passed compliance review. */}
      </View>
    </TabBarInsetProvider>
  );
}
