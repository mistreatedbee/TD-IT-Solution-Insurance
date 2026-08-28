import {
  BellIcon,
  HomeIcon,
  MapPinIcon,
  PackageIcon,
  UserIcon,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FEATURE_ALERTS_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
} from '../config/features';
import { colors, minTouchTarget, spacing } from '../theme/tokens';

interface TabRoute {
  key: string;
  name: string;
}

export interface FloatingTabBarNavigation {
  emit: (event: {
    type: string;
    target?: string;
    canPreventDefault?: boolean;
  }) => { defaultPrevented: boolean };
  navigate: (name: string) => void;
}

interface FloatingTabBarProps {
  state: {
    index: number;
    routes: TabRoute[];
  };
  navigation: FloatingTabBarNavigation;
}

const TAB_CONFIG: Record<
  string,
  { Icon: React.ComponentType<{ color: string; size: number }>; label: string }
> = {
  index: { Icon: HomeIcon, label: 'Home' },
  assets: { Icon: PackageIcon, label: 'Assets' },
  map: { Icon: MapPinIcon, label: 'Map' },
  alerts: { Icon: BellIcon, label: 'Alerts' },
  account: { Icon: UserIcon, label: 'Account' },
};

const VISIBLE_TAB_ORDER = ['index', 'assets', 'map', 'alerts', 'account'] as const;

const TAB_ENABLED: Record<(typeof VISIBLE_TAB_ORDER)[number], boolean> = {
  index: true,
  assets: true,
  map: FEATURE_LOCATION_TRACKING_ENABLED,
  alerts: FEATURE_ALERTS_ENABLED,
  account: true,
};

function TabButton({
  focused,
  label,
  Icon,
  onPress,
}: {
  focused: boolean;
  label: string;
  Icon: React.ComponentType<{ color: string; size: number }>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.tab}
    >
      <Icon size={22} color={focused ? colors.textInverse : colors.slate[400]} />
      <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

export function FloatingTabBar({ state, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRouteName = state.routes[state.index]?.name;

  const visibleRoutes = VISIBLE_TAB_ORDER.filter((name) => TAB_ENABLED[name])
    .map((name) => state.routes.find((route) => route.name === name))
    .filter((route): route is TabRoute => route != null);

  function onTabPress(route: TabRoute) {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    const isFocused = activeRouteName === route.name;
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View style={styles.bar}>
        {visibleRoutes.map((route) => {
          const config = TAB_CONFIG[route.name];
          if (!config) return null;
          return (
            <TabButton
              key={route.key}
              focused={activeRouteName === route.name}
              label={config.label}
              Icon={config.Icon}
              onPress={() => onTabPress(route)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.slate[900],
    borderRadius: 24,
    minHeight: 72,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    gap: 3,
    paddingHorizontal: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.slate[400],
  },
  tabLabelActive: {
    color: colors.accentGold,
  },
});
