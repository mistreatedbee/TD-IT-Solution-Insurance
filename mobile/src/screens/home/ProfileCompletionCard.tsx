import { useRouter, type Href } from 'expo-router';
import { ChevronRightIcon, UserCircle2Icon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { homeShadow } from './homeStyles';

export interface ProfileCompletionCardProps {
  percent: number;
  checklist: { id: string; label: string; done: boolean }[];
  onPress?: () => void;
}

export function ProfileCompletionCard({ percent, checklist, onPress }: ProfileCompletionCardProps) {
  const router = useRouter();
  if (percent >= 100) return null;

  const pending = checklist.filter((item) => !item.done).slice(0, 2);

  function handlePress() {
    if (onPress) {
      onPress();
      return;
    }
    router.push('/(app)/account/profile' as Href);
  }

  return (
    <Pressable
      style={styles.card}
      accessibilityRole="button"
      onPress={handlePress}
    >
      <View style={styles.iconWrap}>
        <UserCircle2Icon size={28} color={colors.accentGoldDeep} strokeWidth={2.2} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>Complete your profile</Text>
        <Text style={styles.percent}>{percent}% complete</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${percent}%` }]} />
        </View>
        {pending.map((item) => (
          <Text key={item.id} style={styles.checkItem}>
            ○ {item.label}
          </Text>
        ))}
      </View>

      <ChevronRightIcon size={20} color={colors.slate[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFBEB',
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...homeShadow,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accentGoldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  percent: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.accentGoldDeep,
    marginBottom: spacing.sm,
  },
  barTrack: {
    height: 6,
    backgroundColor: 'rgba(217,114,10,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accentGold,
  },
  checkItem: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
});
