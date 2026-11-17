import {
  DarkTheme,
  DefaultTheme,
  Tabs,
  ThemeProvider as NavThemeProvider,
} from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useDesignTokens } from '../../../src/theme/designTheme';
import { Backdrop } from '../../../src/design/Backdrop';
import {
  FEATURE_ALERTS_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
} from '../../../src/config/features';
import { TabBarInsetProvider } from '../../../src/navigation/TabBarInsetContext';
import { FloatingTabBar } from '../../../src/navigation/FloatingTabBar';
import {
  useMapTabSceneStyle,
  useTabSceneStyle,
} from '../../../src/navigation/tabBarMetrics';

/**
 * Tab navigator for the authenticated app shell.
 */
export default function AppTabsLayout() {
  const tabSceneStyle = useTabSceneStyle();
  const mapTabSceneStyle = useMapTabSceneStyle();
  const { mode } = useDesignTokens();
  // The navigation theme paints an opaque default (light grey) behind every tab screen, which would hide the
  // shared gradient. Make it transparent for the tab area only.
  const navTheme = React.useMemo(() => {
    const base = mode === 'night' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: 'transparent',
        card: 'transparent',
      },
    };
  }, [mode]);

  return (
    <NavThemeProvider value={navTheme}>
      <TabBarInsetProvider>
        <View style={{ flex: 1 }}>
          {/* One full-screen gradient behind every tab. Drawing it per page left a pale strip at the bottom of the
            tabs that sit inside their own stack (Assets, Alerts, Account). */}
          <Backdrop variant="gradient" testID="tabs-backdrop" />
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
              // The custom bar floats above the pages; without absolute positioning the navigator reserves a strip
              // for it, so page backgrounds stop short of the screen bottom.
              tabBarStyle: { position: 'absolute' },
              sceneStyle: { ...tabSceneStyle, backgroundColor: 'transparent' },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{ title: 'Home', headerShown: false }}
            />
            <Tabs.Screen
              name="assets"
              options={{ title: 'Assets', headerShown: false }}
            />
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
            <Tabs.Screen
              name="account"
              options={{ title: 'Account', headerShown: false }}
            />
          </Tabs>
          {/* AI assistant is not built (button only showed a "coming soon" alert, overlapped content and
            offered nothing to a stressed user — mobile-ui-ux-review.md). Re-mount <DraggableAssistFab />
            here only once a real assistant exists and has passed compliance review. */}
        </View>
      </TabBarInsetProvider>
    </NavThemeProvider>
  );
}
