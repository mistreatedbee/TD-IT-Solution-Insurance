import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TrackingStatus } from '../../tracking/types';
import { trackingStatusTone } from '../../tracking/resolveTrackingStatus';
import { useColors } from '../../theme/ThemeProvider';
import { radius, typography } from '../../theme/tokens';

export interface TrackingStatusChipProps {
  status: TrackingStatus;
  label: string;
  compact?: boolean;
}

export function TrackingStatusChip({ status, label, compact }: TrackingStatusChipProps) {
  const colors = useColors();
  const toneKey = trackingStatusTone(status);

  const tone = useMemo(() => {
    const tones: Record<
      ReturnType<typeof trackingStatusTone>,
      { bg: string; text: string; dot: string }
    > = {
      emerald: {
        bg: colors.tones.success.background,
        text: colors.tones.success.text,
        dot: colors.success,
      },
      gold: {
        bg: colors.accentGoldTint,
        text: colors.accentGoldDeep,
        dot: colors.accentGoldDeep,
      },
      warning: {
        bg: colors.tones.warning.background,
        text: colors.tones.warning.text,
        dot: colors.tones.warning.icon,
      },
      neutral: {
        bg: colors.slate[100],
        text: colors.slate[500],
        dot: colors.slate[400],
      },
      danger: {
        bg: colors.tones.danger.background,
        text: colors.tones.danger.text,
        dot: colors.tones.danger.icon,
      },
    };
    return tones[toneKey];
  }, [colors, toneKey]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: radius.full,
        },
        chipCompact: {
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
        dot: {
          width: 7,
          height: 7,
          borderRadius: 4,
        },
        label: {
          fontSize: typography.sizes.xs,
          fontWeight: '700',
        },
        labelCompact: {
          fontSize: 10,
        },
      }),
    [],
  );

  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }, compact ? styles.chipCompact : null]}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.label, { color: tone.text }, compact ? styles.labelCompact : null]}>
        {label}
      </Text>
    </View>
  );
}
