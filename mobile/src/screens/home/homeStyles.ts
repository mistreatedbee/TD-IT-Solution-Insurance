/**
 * Shared home-screen styles — Design System rollout R5.2.
 *
 * Page ground is the design Backdrop; every block of text sits on a GlassCard.
 * Gutter is space-4, gap between cards is space-6 (design-system/reference/README.md).
 */
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDesignTokens } from '../../theme/designTheme';

export function useHomeStyles() {
  const t = useDesignTokens();

  return useMemo(
    () =>
      StyleSheet.create({
        fill: { flex: 1 },
        transparent: { backgroundColor: 'transparent' },
        body: {
          paddingHorizontal: t.spacing.s4,
          paddingTop: t.spacing.s4,
          paddingBottom: t.spacing.s6,
          gap: t.spacing.s6,
        },
        /** Title row inside a glass card (title + optional action link). */
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: t.spacing.s3,
        },
        sectionTitle: { ...t.type.displayMd, color: t.colors.ink, flexShrink: 1 },
        sectionSubtitle: { ...t.type.bodySm, color: t.colors.inkMuted, marginTop: t.spacing.s1 },
        sectionLink: { ...t.type.label, color: t.colors.link },
        /** 48dp tap target for inline text actions. */
        linkTarget: { minHeight: 48, justifyContent: 'center', paddingHorizontal: t.spacing.s2 },
        /** Hairline between header and content within one card. */
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: t.colors.borderSubtle,
          marginVertical: t.spacing.s3,
        },
        /** Space between sibling cards that share one section heading. */
        stack: { gap: t.spacing.s3 },
        iconTile: {
          width: 48,
          height: 48,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        },
        iconTileSm: {
          width: 36,
          height: 36,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
        },
        eyebrow: {
          ...t.type.labelSm,
          color: t.colors.accentText,
          textTransform: 'uppercase',
          marginBottom: t.spacing.s2,
        },
        title: { ...t.type.title, color: t.colors.ink },
        textBody: { ...t.type.body, color: t.colors.inkMuted },
        textBodySm: { ...t.type.bodySm, color: t.colors.inkMuted },
      }),
    [t],
  );
}
