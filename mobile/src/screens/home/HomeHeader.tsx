import { useRouter, type Href } from 'expo-router';
import { BellIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { FEATURE_ALERTS_ENABLED, FEATURE_ASSISTANT_ENTRY_ENABLED } from '../../config/features';
import { GlassCard, TDAssistantIcon } from '../../design';
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
        headerAction: {
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

        {FEATURE_ASSISTANT_ENTRY_ENABLED ? (
          // Feature 024 Phase 1a: the assistant takes the top-right slot. Alerts stay reachable
          // from the Alerts tab (which carries the unread badge) and the Needs attention card.
          <Pressable
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="TD IT Solutions Insurance assistant"
            accessibilityHint="Ask a question or talk to support"
            testID="home-assistant-button"
            onPress={() => router.push('/(app)/assistant' as Href)}
          >
            <TDAssistantIcon size={24} color={t.colors.ink} strokeWidth={1.75} testID="home-assistant-icon" />
          </Pressable>
        ) : FEATURE_ALERTS_ENABLED ? (
          <Pressable
            style={styles.headerAction}
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
