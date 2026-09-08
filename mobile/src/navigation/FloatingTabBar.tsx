import {
  BellIcon,
  ClipboardListIcon,
  HomeIcon,
  MapPinIcon,
  PackageIcon,
  UserIcon,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FEATURE_ALERTS_ENABLED,
  FEATURE_LOCATION_TRACKING_ENABLED,
} from '../config/features';
import { useProtectionDashboard } from '../tracking/useProtectionDashboard';
import { useTheme } from '../theme/ThemeProvider';
import { minTouchTarget, spacing } from '../theme/tokens';
import { GlassSurface } from './GlassSurface';
import { useLiquidGlassChrome } from './useLiquidGlassChrome';

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
  variant?: 'customer' | 'security';
}

const CUSTOMER_TAB_CONFIG: Record<
  string,
  { Icon: React.ComponentType<{ color: string; size: number }>; label: string }
> = {
  index: { Icon: HomeIcon, label: 'Home' },
  assets: { Icon: PackageIcon, label: 'Assets' },
  map: { Icon: MapPinIcon, label: 'Map' },
  alerts: { Icon: BellIcon, label: 'Alerts' },
  account: { Icon: UserIcon, label: 'Account' },
};

const SECURITY_TAB_CONFIG: Record<
  string,
  { Icon: React.ComponentType<{ color: string; size: number }>; label: string }
> = {
  index: { Icon: ClipboardListIcon, label: 'Cases' },
  profile: { Icon: UserIcon, label: 'Profile' },
};

const CUSTOMER_TAB_ORDER = ['index', 'assets', 'map', 'alerts', 'account'] as const;
const SECURITY_TAB_ORDER = ['index', 'profile'] as const;

const CUSTOMER_TAB_ENABLED: Record<(typeof CUSTOMER_TAB_ORDER)[number], boolean> = {
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
  badgeCount = 0,
  colors,
  isDark,
  styles,
}: {
  focused: boolean;
  label: string;
  Icon: React.ComponentType<{ color: string; size: number }>;
  onPress: () => void;
  badgeCount?: number;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
  styles: ReturnType<typeof createTabBarStyles>['styles'];
}) {
  const accessibilityLabel =
    badgeCount > 0 ? `${label}, ${badgeCount} open alert${badgeCount === 1 ? '' : 's'}` : label;

  const iconColor = focused
    ? colors.accentBlue
    : isDark
      ? colors.slate[400]
      : colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.tab}
    >
      <View style={styles.iconWrap}>
        <Icon size={22} color={iconColor} />
        {badgeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

function createTabBarStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean,
  glassBorder: string,
) {
  return {
    styles: StyleSheet.create({
      wrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing.lg,
        zIndex: 50,
      },
      bar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 28,
        minHeight: 72,
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: glassBorder,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.18 : 0.05,
        shadowRadius: 16,
        elevation: 6,
      },
      tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: minTouchTarget,
        gap: 3,
        paddingHorizontal: 2,
      },
      iconWrap: {
        position: 'relative',
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
      },
      badge: {
        position: 'absolute',
        top: -2,
        right: -6,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.accentBlue,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
      },
      badgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: colors.textInverse,
      },
      tabLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: isDark ? colors.slate[400] : colors.textSecondary,
      },
      tabLabelActive: {
        color: colors.accentBlue,
      },
    }),
  };
}

export function FloatingTabBar({ state, navigation, variant = 'customer' }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const glass = useLiquidGlassChrome();
  const { styles } = useMemo(
    () => createTabBarStyles(colors, isDark, glass.border),
    [colors, glass.border, isDark],
  );
  const activeRouteName = state.routes[state.index]?.name;
  const { data: dashboard } = useProtectionDashboard();
  const alertCount = FEATURE_ALERTS_ENABLED ? dashboard?.alertCount ?? 0 : 0;

  const tabConfig = variant === 'security' ? SECURITY_TAB_CONFIG : CUSTOMER_TAB_CONFIG;
  const tabOrder = variant === 'security' ? SECURITY_TAB_ORDER : CUSTOMER_TAB_ORDER;
  const visibleRoutes = tabOrder
    .filter((name) => {
      if (variant === 'security') return true;
      return CUSTOMER_TAB_ENABLED[name as (typeof CUSTOMER_TAB_ORDER)[number]];
    })
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
      <GlassSurface
        style={styles.bar}
        colorScheme={glass.colorScheme}
        tintColor={glass.tint}
        glassEffectStyle={glass.glassEffectStyle}
        blurIntensity={glass.blurIntensity}
      >
        {visibleRoutes.map((route) => {
          const config = tabConfig[route.name];
          if (!config) return null;
          return (
            <TabButton
              key={route.key}
              focused={activeRouteName === route.name}
              label={config.label}
              Icon={config.Icon}
              badgeCount={variant === 'customer' && route.name === 'alerts' ? alertCount : 0}
              onPress={() => onTabPress(route)}
              colors={colors}
              isDark={isDark}
              styles={styles}
            />
          );
        })}
      </GlassSurface>
    </View>
  );
}
