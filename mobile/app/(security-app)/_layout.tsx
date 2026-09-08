/**
 * Tab navigator for the security partner app shell.
 */
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { FEATURE_SECURITY_OPERATOR_ENABLED } from '../../src/config/features';
import { FloatingTabBar } from '../../src/navigation/FloatingTabBar';
import { TabBarInsetProvider } from '../../src/navigation/TabBarInsetContext';
import { useTabSceneStyle } from '../../src/navigation/tabBarMetrics';
import { FeatureUnavailableScreen } from '../../src/screens/common/FeatureUnavailableScreen';
import { usePushNotifications } from '../../src/notifications/usePushNotifications';
import { useNotificationDeepLinks } from '../../src/notifications/useNotificationDeepLinks';

/**
 * INC-001 A-12: the security-operator portal shipped with no Stage 8 record.
 */
export default function SecurityAppTabsLayout() {
  usePushNotifications();
  useNotificationDeepLinks();
  const tabSceneStyle = useTabSceneStyle();

  if (!FEATURE_SECURITY_OPERATOR_ENABLED) {
    return (
      <FeatureUnavailableScreen
        headline="Operator portal is coming soon."
        body="The security partner app is not available in this build yet. Please use the web dashboard or contact your account manager."
      />
    );
  }

  return (
    <TabBarInsetProvider>
      <View style={{ flex: 1 }}>
        <Tabs
          tabBar={(props) => (
            <FloatingTabBar
              state={props.state}
              navigation={props.navigation as never}
              variant="security"
            />
          )}
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            sceneStyle: tabSceneStyle,
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Cases' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
          <Tabs.Screen name="cases/[caseId]" options={{ href: null }} />
          <Tabs.Screen name="tracking/[caseId]" options={{ href: null }} />
          <Tabs.Screen name="notification-preferences" options={{ href: null }} />
        </Tabs>
      </View>
    </TabBarInsetProvider>
  );
}
