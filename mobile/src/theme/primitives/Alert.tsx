/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 *
 * RN port of the not-yet-implemented `Alert` component specified in
 * docs/features/001-authentication/design-system-additions.md §2. That
 * document is the source of truth for tone semantics, dismiss behavior,
 * and the aria-live/role split (assertive for inline warning/danger,
 * polite for info/success on a full screen change) — this is a
 * platform-appropriate (RN accessibility, not ARIA) implementation of the
 * same contract, not an independently designed component.
 */
import React from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react-native';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, minTouchTarget, radius, spacing, typography } from '../tokens';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone: AlertTone;
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Rendered below the message body — typically a Button or text link. */
  action?: React.ReactNode;
  /**
   * Whether this Alert appears inline, without an accompanying screen
   * change (e.g. an escalating-lockout warning after a failed attempt).
   * Per design-system-additions.md §2: inline warning/danger alerts
   * announce assertively; alerts that accompany a screen change (the
   * default) announce politely, since the screen reader already
   * encounters them via normal reading order.
   */
  announceAssertively?: boolean;
  style?: StyleProp<ViewStyle>;
}

const toneIcon: Record<AlertTone, React.ComponentType<{ size?: number; color?: string }>> = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: TriangleAlertIcon,
  danger: AlertCircleIcon,
};

export function Alert({
  tone,
  title,
  children,
  dismissible = false,
  onDismiss,
  action,
  announceAssertively = false,
  style,
}: AlertProps) {
  const palette = colors.tones[tone];
  const Icon = toneIcon[tone];

  React.useEffect(() => {
    // Best-effort assertive announcement for screen readers on inline
    // warning/danger alerts that appear without a navigation event —
    // RN has no native aria-live equivalent, so this is the closest
    // platform-appropriate substitute (design-system-additions.md §2).
    if (announceAssertively && (tone === 'warning' || tone === 'danger')) {
      const message = title ? `${title}. ${flattenChildren(children)}` : flattenChildren(children);
      AccessibilityInfo.announceForAccessibility(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      accessibilityRole={tone === 'warning' || tone === 'danger' ? 'alert' : undefined}
      style={[
        styles.base,
        { backgroundColor: palette.background, borderColor: palette.border },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <Icon size={20} color={palette.icon} />
        <View style={styles.textColumn}>
          {title ? <Text style={[styles.title, { color: palette.text }]}>{title}</Text> : null}
          <Text style={[styles.body, { color: palette.text }]}>{children}</Text>
          {action ? <View style={styles.actionRow}>{action}</View> : null}
        </View>
        {dismissible ? (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={8}
            style={styles.dismissButton}
          >
            <XIcon size={18} color={palette.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function flattenChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(flattenChildren).join(' ');
  return '';
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radius.input,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  textColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
  },
  body: {
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * 1.4,
  },
  actionRow: {
    marginTop: spacing.sm,
  },
  dismissButton: {
    minWidth: minTouchTarget / 2,
    minHeight: minTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
