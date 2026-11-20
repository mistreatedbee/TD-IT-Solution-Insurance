import { CheckCircle2Icon, MapPinIcon, ShieldIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDate } from '../../lib/asset-labels';
import { useDesignTokens } from '../../theme/designTheme';
import { trackingMethodDescription, trackingMethodFor } from '../../tracking/trackingMethod';

export interface TimelineEvent {
  id: string;
  title: string;
  subtitle?: string;
  tone?: 'default' | 'success' | 'muted';
}

export interface ActivityTimelineProps {
  events: TimelineEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  const t = useDesignTokens();
  if (events.length === 0) return null;

  function icon(event: TimelineEvent) {
    if (event.id.includes('location')) return <MapPinIcon size={16} color={t.colors.ink} strokeWidth={1.75} />;
    if (event.id.includes('protection') || event.id.includes('registered')) {
      return <ShieldIcon size={16} color={t.colors.link} strokeWidth={1.75} />;
    }
    return <CheckCircle2Icon size={16} color={t.colors.success} strokeWidth={1.75} />;
  }

  return (
    <View style={{ gap: t.spacing.s2 }}>
      {events.map((event, index) => (
        <View key={event.id} style={[styles.item, { gap: t.spacing.s3 }]}>
          <View style={styles.track}>
            <View style={[styles.iconWrap, { backgroundColor: t.colors.bgSunken, borderRadius: t.radius.sm }]}>
              {icon(event)}
            </View>
            {index < events.length - 1 ? (
              <View style={[styles.line, { backgroundColor: t.colors.borderSubtle, marginTop: t.spacing.s1 }]} />
            ) : null}
          </View>
          <View style={[styles.copy, { paddingBottom: t.spacing.s2 }]}>
            <Text
              style={[
                t.type.label,
                { color: event.tone === 'muted' ? t.colors.inkMuted : event.tone === 'success' ? t.colors.success : t.colors.ink },
              ]}
            >
              {event.title}
            </Text>
            {event.subtitle ? <Text style={[t.type.bodySm, { color: t.colors.inkMuted }]}>{event.subtitle}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function pendingLocationSubtitle(assetType: string | null | undefined): string {
  switch (trackingMethodFor(assetType)) {
    case 'this_app':
      return 'Turn on location sharing on this phone';
    case 'our_software':
      return trackingMethodDescription(assetType);
    default:
      return 'Connect a GPS tracker when available';
  }
}

export function buildAssetTimeline(input: {
  registeredAt?: string | null;
  trackingLabel?: string;
  locationLabel?: string | null;
  hasLocation?: boolean;
  assetType?: string | null;
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
      subtitle: pendingLocationSubtitle(input.assetType),
      tone: 'muted',
    });
  }

  return events;
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row' },
  track: { alignItems: 'center', width: 32 },
  iconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, minHeight: 16 },
  copy: { flex: 1 },
});
