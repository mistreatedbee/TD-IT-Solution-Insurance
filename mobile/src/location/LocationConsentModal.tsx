/**
 * In-app primer shown before the OS location permission dialog (Feature 008 §2.2).
 *
 * Copy is `compliance-specialist`'s, verbatim, per INC-002 §12.3
 * (`docs/organization/incidents/INC-002-play-internal-location-reenablement.md`).
 * Do not paraphrase, shorten or re-weight any of it — see §12.3's own note and
 * the "prominence rule" it cites (008 §8.2).
 *
 * Structure is the two-layer disclosure §12.2 authorises: Layer 1 (elements
 * 1, 2, 3, 4, 7) is always visible, no interaction required. Layer 2
 * (elements 5, 8, plus the other-assets/OS-prompt notes) sits behind a single
 * in-modal expander that opens in place — no navigation, no dismissal — per
 * CS-INC002-N4, reusing the expand/collapse accessibility pattern from
 * `ProtectionMapScreen.tsx` (`AssetMapSheet`'s `Pressable` +
 * `accessibilityState={{ expanded }}` + explicit expand/collapse label).
 *
 * Two lines are deliberately OMITTED, not paraphrased, per compliance-specialist's
 * own blocking conditions in INC-002 §12.4:
 *  - CS-INC002-N1 (blocking): the storage-region sentence in `DETAIL_WHO_SEES_IT`
 *    ("...stored on our service providers' servers in {{STORAGE_REGION}}.") —
 *    the Atlas region (D-3) is still open, and a rendered placeholder or a
 *    guessed region is "a false s18 notice". Omitted until D-3 returns and
 *    compliance-specialist supplies the literal string.
 *  - CS-INC002-N2 (blocking): `DETAIL_HOW_LONG` in its entirety — the retention
 *    periods it states are unenforced (no TTL purge job yet). §12.4 is explicit
 *    "I am issuing no interim variant" — there is no vaguer fallback sentence
 *    to ship in its place, so element 6 is not rendered at all until
 *    `database-architect`/`backend-engineer` close SR-INC002-W2/C-008-5.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react-native';
import { Button, Card } from '../theme/primitives';
import { colors, spacing, typography } from '../theme/tokens';

export interface LocationConsentModalProps {
  visible: boolean;
  assetName?: string;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

export function LocationConsentModal({
  visible,
  assetName,
  onAccept,
  onDecline,
  loading = false,
}: LocationConsentModalProps) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <Card style={styles.sheet}>
          <Text style={styles.title}>Let this phone report its own location?</Text>

          {/* Layer 1 — always visible, elements 1, 2, 3, 4, 7 (INC-002 §12.2) */}
          <Text style={styles.body}>
            <Text style={styles.bodyBold}>What and when. </Text>
            We collect this phone&apos;s precise GPS position and how accurate that reading is
            — only while you have the app open, or when you tap &quot;Update location&quot;.
            Never in the background. Never while the app is closed.
          </Text>
          <Text style={styles.body}>
            <Text style={styles.bodyBold}>Why. </Text>
            So that if this phone is lost or stolen, you can see where it last reported from.
            This is not a live tracker, and it cannot find a phone that has been switched off,
            reset, or put in airplane mode.
          </Text>
          <Text style={styles.body}>
            <Text style={styles.bodyBold}>Your choice. </Text>
            This is optional. If you tap &quot;Not now&quot;, nothing changes — your cover, your
            premium, your policy and your registered assets all stay exactly the same. Only turn
            this on for a phone you own and carry yourself.
          </Text>
          <Text style={styles.body}>
            <Text style={styles.bodyBold}>Turning it off. </Text>
            You can switch this off at any time from this asset&apos;s screen, under
            &quot;Location&quot; — it takes the same one tap it took to turn on. When you do, we
            delete the locations this phone has reported and tell you how many we deleted.
          </Text>

          <Pressable
            onPress={() => setExpanded((prev) => !prev)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} the full details`}
            style={styles.toggle}
          >
            <Text style={styles.toggleLabel}>The full details</Text>
            <Chevron size={18} color={colors.primary} strokeWidth={2.2} />
          </Pressable>

          {expanded ? (
            <View style={styles.detailsGroup}>
              {/* element 5 — recipients + country (CS-INC002-N1: storage-region
                  sentence omitted, blocking on D-3) */}
              <Text style={styles.body}>
                <Text style={styles.bodyBold}>Who can see it. </Text>
                You, and the TD IT Solution staff who need it to help you. We never sell it and
                never give it to advertisers. It is not sent to a security company automatically
                — if you open a theft-recovery case and we need to share your last known location
                with a recovery partner, we will ask you at that point, separately.
              </Text>

              {/* element 6 — DETAIL_HOW_LONG omitted entirely per CS-INC002-N2 */}

              {/* element 8 — s23/s24 rights + Information Regulator */}
              <Text style={styles.body}>
                <Text style={styles.bodyBold}>Your rights. </Text>
                You can ask us what location information we hold about you, ask us to correct it,
                or ask us to delete it — contact us from the Account screen. If you are not happy
                with how we handle it, you can complain to South Africa&apos;s Information
                Regulator at inforegulator.org.za.
              </Text>

              <Text style={styles.body}>
                <Text style={styles.bodyBold}>Other assets. </Text>
                Laptops, vehicles and other items need separate GPS hardware, which we do not
                offer yet. This setting only affects this phone. You can still see any
                last-known locations we already hold for your other assets.
              </Text>

              <Text style={styles.note}>
                If you continue, we record your choice first, and then your phone will ask you
                for location permission. You can say no there too.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button variant="secondary" onPress={onDecline} disabled={loading}>
              Not now
            </Button>
            <Button onPress={onAccept} loading={loading}>
              Turn on location
            </Button>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    gap: spacing.md,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  body: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
  },
  bodyBold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  note: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  toggleLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.primary,
  },
  detailsGroup: {
    gap: spacing.md,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});
