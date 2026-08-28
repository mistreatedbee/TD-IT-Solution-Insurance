import { useRouter, type Href } from 'expo-router';
import { BellIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FEATURE_ALERTS_ENABLED } from '../../config/features';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';

export interface HomeHeaderProps {
  greeting: string;
  name: string;
  subtitle: string;
  alertCount: number;
  initials: string;
}

export function HomeHeader({ greeting, name, subtitle, alertCount, initials }: HomeHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.profileRow}
        accessibilityRole="button"
        onPress={() => router.push('/(app)/account' as Href)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.greeting}>
            {greeting}, {name}
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </Pressable>

      {FEATURE_ALERTS_ENABLED ? (
        <Pressable
          style={styles.bell}
          accessibilityRole="button"
          accessibilityLabel={`Alerts${alertCount > 0 ? `, ${alertCount} open` : ''}`}
          onPress={() => router.push('/(app)/alerts' as Href)}
        >
          <BellIcon size={22} color={colors.primary} strokeWidth={2.2} />
          {alertCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{alertCount > 9 ? '9+' : alertCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  profileRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: typography.sizes.base,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
  },
  greeting: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.35,
  },
  bell: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textInverse,
  },
});
