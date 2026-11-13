import { CircleCheck, Clock, FileText, MapPin, MapPinOff, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDesignTokens } from '../theme/designTheme';

export type StatusBadgeStatus =
  | 'PROTECTED'
  | 'TRACKING'
  | 'PENDING VERIFICATION'
  | 'LOST'
  | 'STOLEN'
  | 'RECOVERED'
  | 'CLAIM OPEN';

type Tone = 'success' | 'danger' | 'warning' | 'info';

const STATUS_META: Record<StatusBadgeStatus, { tone: Tone; Icon: LucideIcon }> = {
  PROTECTED: { tone: 'success', Icon: ShieldCheck },
  TRACKING: { tone: 'info', Icon: MapPin },
  'PENDING VERIFICATION': { tone: 'warning', Icon: Clock },
  LOST: { tone: 'danger', Icon: MapPinOff },
  STOLEN: { tone: 'danger', Icon: TriangleAlert },
  RECOVERED: { tone: 'success', Icon: CircleCheck },
  'CLAIM OPEN': { tone: 'info', Icon: FileText },
};

export const STATUS_BADGE_VOCABULARY = Object.keys(STATUS_META) as StatusBadgeStatus[];

/** Non-interactive state label: always icon + word, never colour alone. */
export function StatusBadge({ status, testID }: { status: StatusBadgeStatus; testID?: string }) {
  const t = useDesignTokens();
  const { tone, Icon } = STATUS_META[status];
  const fg = { success: t.colors.success, danger: t.colors.danger, warning: t.colors.warning, info: t.colors.link }[tone];
  const bg = { success: t.colors.successBg, danger: t.colors.dangerBg, warning: t.colors.warningBg, info: t.colors.infoBg }[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`Status: ${status.toLowerCase()}`}
      style={[styles.badge, { backgroundColor: bg, borderRadius: t.radius.pill, paddingHorizontal: t.spacing.s3, paddingVertical: t.spacing.s1 }]}
    >
      <Icon testID="status-icon" size={14} strokeWidth={1.75} color={fg} />
      <Text style={[t.type.labelSm, { color: fg, marginLeft: t.spacing.s1 }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});
