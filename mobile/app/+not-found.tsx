/**
 * Unmatched-route screen (INC-003 §30 advisory, with C-11 / M-1), restyled to the design system.
 *
 * Replaces Expo Router's default unmatched screen, which shows the requested
 * path. Incoming `tditinsurance://` URLs are attacker-controllable and auth
 * email links carry single-use tokens in the query, so this screen
 * deliberately never reads or renders the path, segments or search params.
 * Design components only; no routing data is read.
 */
import { useRouter } from 'expo-router';
import { MapPinOffIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DesignPage } from '../src/components/DesignPage';
import { Button, GlassCard } from '../src/design';
import { useDesignTokens } from '../src/theme/designTheme';

export default function NotFoundScreen() {
  const router = useRouter();
  const t = useDesignTokens();

  function handleContinue() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }

  return (
    <DesignPage scroll={false} padded={false}>
      <View style={[styles.center, { paddingHorizontal: t.spacing.s4 }]}>
        <GlassCard radius="xl" style={styles.card}>
          <View style={styles.iconRow}>
            <MapPinOffIcon size={44} color={t.colors.brandOrange} strokeWidth={1.8} />
          </View>
          <Text
            style={[t.type.displayMd, styles.centerText, { color: t.colors.ink, marginTop: t.spacing.s4 }]}
            accessibilityRole="header"
          >
            Page not found
          </Text>
          <Text style={[t.type.body, styles.centerText, { color: t.colors.inkMuted, marginTop: t.spacing.s3 }]}>
            This link does not open anything in the app. If it came from an email, open it again from the
            latest message, or continue to the app.
          </Text>
          <Button label="Continue" onPress={handleContinue} style={{ marginTop: t.spacing.s6, alignSelf: 'stretch' }} />
        </GlassCard>
      </View>
    </DesignPage>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  card: { alignSelf: 'stretch' },
  iconRow: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
});
