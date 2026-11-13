import { Bell, House, Package, User, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { floatingTabBarBottomPadding } from '../navigation/tabBarMetrics';
import { useDesignTokens } from '../theme/designTheme';
import { GlassCard } from './GlassCard';

export type TabBarKey = 'home' | 'assets' | 'alerts' | 'account';

export interface TabBarItem {
  key: TabBarKey;
  label: 'Home' | 'Assets' | 'Alerts' | 'Account';
}

export const TAB_BAR_ITEMS: readonly TabBarItem[] = [
  { key: 'home', label: 'Home' },
  { key: 'assets', label: 'Assets' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'account', label: 'Account' },
];

const ICONS: Record<TabBarKey, LucideIcon> = { home: House, assets: Package, alerts: Bell, account: User };

export interface TabBarProps {
  /** Exactly four tabs: Home, Assets, Alerts, Account. */
  items?: readonly TabBarItem[];
  activeKey: TabBarKey;
  onPress: (key: TabBarKey) => void;
  /** Unread alerts; >0 shows a danger dot and adds the count to the label. */
  alertCount?: number;
  testID?: string;
}

export function TabBar({ items = TAB_BAR_ITEMS, activeKey, onPress, alertCount = 0, testID }: TabBarProps) {
  const t = useDesignTokens();
  const insets = useSafeAreaInsets();
  // Existing helper keeps the bar above the home indicator; space-4 side margins.
  const bottom = Math.max(floatingTabBarBottomPadding(insets.bottom), insets.bottom + t.spacing.s4);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom, left: t.spacing.s4, right: t.spacing.s4 }]}
      testID={testID}
    >
      <GlassCard strong radius="pill" style={styles.bar}>
        <View accessibilityRole="tablist" style={styles.row}>
          {items.map((item) => {
            const active = item.key === activeKey;
            const Icon = ICONS[item.key];
            const fg = active ? t.colors.onActionPrimary : t.colors.inkMuted;
            const unread = item.key === 'alerts' && alertCount > 0;
            const label = unread ? `${item.label}, ${alertCount} unread` : item.label;
            return (
              <Pressable
                key={item.key}
                testID={`tab-${item.key}`}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                onPress={() => onPress(item.key)}
                style={[
                  styles.tab,
                  { borderRadius: t.radius.pill, backgroundColor: active ? t.colors.actionPrimary : 'transparent' },
                ]}
              >
                <View>
                  <Icon size={22} strokeWidth={1.75} color={fg} />
                  {unread ? (
                    <View
                      testID="alerts-unread-dot"
                      style={[styles.dot, { backgroundColor: t.colors.danger, borderColor: t.colors.bgRaised }]}
                    />
                  ) : null}
                </View>
                <Text style={[t.type.labelSm, { color: fg, letterSpacing: 0 }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  bar: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -8, marginVertical: -8 },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
