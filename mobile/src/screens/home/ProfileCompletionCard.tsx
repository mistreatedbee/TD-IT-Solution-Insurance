import { useRouter, type Href } from 'expo-router';
import { ChevronRightIcon, CircleIcon, UserCircle2Icon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';
import { useHomeStyles } from './homeStyles';

export interface ProfileCompletionCardProps {
  percent: number;
  checklist: { id: string; label: string; done: boolean }[];
  onPress?: () => void;
  /** When true the caller supplies the card; content renders bare. */
  inset?: boolean;
}

export function ProfileCompletionCard({
  percent,
  checklist,
  onPress,
  inset = false,
}: ProfileCompletionCardProps) {
  const router = useRouter();
  const t = useDesignTokens();
  const home = useHomeStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.s3,
          minHeight: 48,
        },
        copy: { flex: 1 },
        percent: { ...t.type.label, color: t.colors.accentText, marginTop: 2, marginBottom: t.spacing.s2 },
        barTrack: {
          height: 4,
          backgroundColor: t.colors.borderSubtle,
          borderRadius: t.radius.pill,
          overflow: 'hidden',
          marginBottom: t.spacing.s2,
        },
        barFill: { height: '100%', backgroundColor: t.colors.actionPrimary },
        checkItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s2, marginTop: 2 },
      }),
    [t],
  );

  if (percent >= 100) return null;

  const pending = checklist.filter((item) => !item.done).slice(0, 2);

  function handlePress() {
    if (onPress) {
      onPress();
      return;
    }
    router.push('/account/profile' as Href);
  }

  const content = (
    <Pressable style={styles.row} accessibilityRole="button" onPress={handlePress}>
      <View style={home.iconTile}>
        <UserCircle2Icon size={24} color={t.colors.ink} strokeWidth={1.75} />
      </View>

      <View style={styles.copy}>
        <Text style={home.title}>Complete your profile</Text>
        <Text style={styles.percent}>{percent}% complete</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${percent}%` }]} />
        </View>
        {pending.map((item) => (
          <View key={item.id} style={styles.checkItem}>
            <CircleIcon size={16} color={t.colors.inkMuted} strokeWidth={1.75} />
            <Text style={home.textBodySm}>{item.label}</Text>
          </View>
        ))}
      </View>

      <ChevronRightIcon size={20} color={t.colors.inkMuted} strokeWidth={1.75} />
    </Pressable>
  );

  if (inset) return content;
  return <GlassCard>{content}</GlassCard>;
}
