import { useRouter, type Href } from 'expo-router';
import { BellIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { FEATURE_ALERTS_ENABLED } from '../../config/features';
import { GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';

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
  const t = useDesignTokens();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: t.spacing.s3,
        },
        profileRow: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.s3,
          minHeight: 48,
        },
        copy: {
          flex: 1,
        },
        greeting: {
          ...t.type.displayMd,
          color: t.colors.ink,
        },
        subtitle: {
          ...t.type.body,
          color: t.colors.inkMuted,
          marginTop: t.spacing.s1,
        },
        bell: {
          width: 48,
          height: 48,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.bgSunken,
          borderWidth: 1,
          borderColor: t.colors.borderControl,
          alignItems: 'center',
          justifyContent: 'center',
        },
        badge: {
          position: 'absolute',
          top: 4,
          right: 4,
          minWidth: 20,
          height: 20,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.actionPrimary,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: t.spacing.s1,
        },
        badgeText: {
          ...t.type.labelSm,
          color: t.colors.onActionPrimary,
        },
      }),
    [t],
  );

  return (
    <GlassCard>
      <View style={styles.wrap}>
        <Pressable
          style={styles.profileRow}
          accessibilityRole="button"
          onPress={() => router.push('/account' as Href)}
        >
          <ProfileAvatar initials={initials} profilePictureUrl={profilePictureUrl} size="md" />
          <View style={styles.copy}>
            <Text style={styles.greeting} accessibilityRole="header">
              {greeting}, {name}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </Pressable>

        {FEATURE_ALERTS_ENABLED ? (
          <Pressable
            style={styles.bell}
            accessibilityRole="button"
            accessibilityLabel={`Alerts${alertCount > 0 ? `, ${alertCount} open` : ''}`}
            onPress={() => router.push('/alerts' as Href)}
          >
            <BellIcon size={24} color={t.colors.ink} strokeWidth={1.75} />
            {alertCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{alertCount > 9 ? '9+' : alertCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </GlassCard>
  );
}
