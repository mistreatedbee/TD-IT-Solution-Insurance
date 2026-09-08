import { useRouter, type Href } from 'expo-router';
import { BellIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { FEATURE_ALERTS_ENABLED } from '../../config/features';
import { useTheme } from '../../theme/ThemeProvider';
import { minTouchTarget, spacing, typography } from '../../theme/tokens';

export interface HomeHeaderProps {
  greeting: string;
  name: string;
  subtitle: string;
  alertCount: number;
  initials: string;
  profilePictureUrl?: string | null;
}

export function HomeHeader({
  greeting,
  name,
  subtitle,
  alertCount,
  initials,
  profilePictureUrl,
}: HomeHeaderProps) {
  const router = useRouter();
  const { colors, elevationSoft } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing.md,
        },
        profileRow: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
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
          alignItems: 'center',
          justifyContent: 'center',
          ...elevationSoft,
        },
        badge: {
          position: 'absolute',
          top: 6,
          right: 6,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: colors.accentBlue,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
        },
        badgeText: {
          fontSize: 10,
          fontWeight: '800',
          color: colors.textInverse,
        },
      }),
    [colors, elevationSoft],
  );

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.profileRow}
        accessibilityRole="button"
        onPress={() => router.push('/account' as Href)}
      >
        <ProfileAvatar initials={initials} profilePictureUrl={profilePictureUrl} size="md" />
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
          onPress={() => router.push('/alerts' as Href)}
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
