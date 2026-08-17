import { CheckCircle2Icon, MapPinIcon, ShieldIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDate } from '../../lib/asset-labels';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export interface TimelineEvent {
  id: string;
  title: string;
  subtitle?: string;
  tone?: 'default' | 'success' | 'muted';
}

export interface ActivityTimelineProps {
  events: TimelineEvent[];
}

function iconForEvent(event: TimelineEvent) {
  if (event.id.includes('location')) {
    return <MapPinIcon size={16} color={colors.primary} strokeWidth={2.2} />;
  }
  if (event.id.includes('protection') || event.id.includes('registered')) {
    return <ShieldIcon size={16} color={colors.accentGoldDeep} strokeWidth={2.2} />;
  }
  return <CheckCircle2Icon size={16} color={colors.success} strokeWidth={2.2} />;
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {events.map((event, index) => (
        <View key={event.id} style={styles.item}>
          <View style={styles.track}>
            <View style={styles.iconWrap}>{iconForEvent(event)}</View>
            {index < events.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={styles.copy}>
            <Text
              style={[
                styles.title,
                event.tone === 'muted' ? styles.titleMuted : null,
                event.tone === 'success' ? styles.titleSuccess : null,
              ]}
            >
              {event.title}
            </Text>
            {event.subtitle ? <Text style={styles.subtitle}>{event.subtitle}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function buildAssetTimeline(input: {
  registeredAt?: string | null;
  trackingLabel?: string;
  locationLabel?: string | null;
  hasLocation?: boolean;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (input.registeredAt) {
    events.push({
      id: 'registered',
      title: 'Asset registered',
      subtitle: formatDate(input.registeredAt),
      tone: 'success',
    });
  }

  events.push({
    id: 'protection',
    title: 'Protection active on your plan',
    subtitle: input.trackingLabel ?? 'Coverage linked',
    tone: 'default',
  });

  if (input.hasLocation && input.locationLabel) {
    events.push({
      id: 'location',
      title: 'Last known location recorded',
      subtitle: `Updated ${input.locationLabel}`,
      tone: 'default',
    });
  } else {
    events.push({
      id: 'location-pending',
      title: 'Location tracking pending',
      subtitle: 'Enable tracking or connect a GPS device when available',
      tone: 'muted',
    });
  }

  return events;
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  track: {
    alignItems: 'center',
    width: 32,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.input,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
    minHeight: 16,
  },
  copy: {
    flex: 1,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  titleMuted: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  titleSuccess: {
    color: colors.success,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xs * 1.45,
  },
});
