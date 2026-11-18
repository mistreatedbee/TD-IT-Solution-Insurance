/**
 * Unmatched-route screen (INC-003 §30 advisory, with C-11 / M-1), built from the supplied 404 design
 * (Figma "PAAQ App", node 62788:85707) in the app's own colours and wording.
 *
 * Replaces Expo Router's default unmatched screen, which shows the requested
 * path. Incoming `tditinsurance://` URLs are attacker-controllable and auth
 * email links carry single-use tokens in the query, so this screen
 * deliberately never reads or renders the path, segments or search params.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DesignPage } from '../src/components/DesignPage';
import { NotFoundIllustration } from '../src/components/NotFoundIllustration';
import { Button, GlassCard } from '../src/design';
import { useDesignTokens } from '../src/theme/designTheme';

export default function NotFoundScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const night = t.mode === 'night';

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
          <View style={styles.art}>
            <NotFoundIllustration
              width={250}
              body={night ? t.colors.brandBlueBright : t.colors.brandBlue}
              accent={t.colors.brandOrange}
              paper={night ? t.colors.bgRaised : t.colors.bgRaised}
            />
          </View>
          <View style={{ gap: t.spacing.s2, marginTop: t.spacing.s4 }}>
            <Text
              style={[
                t.type.displayMd,
                styles.centerText,
                { color: t.colors.ink },
              ]}
              accessibilityRole="header"
            >
              That page has gone missing
            </Text>
            <Text
              style={[
                t.type.body,
                styles.centerText,
                { color: t.colors.inkMuted },
              ]}
            >
              This link is old, incomplete or has moved. If it came from an
              email, open it again from the latest message, or head back to your
              protection.
            </Text>
          </View>
          <Button
            label="Take me back"
            onPress={handleContinue}
            style={{ marginTop: t.spacing.s6, alignSelf: 'stretch' }}
          />
        </GlassCard>
      </View>
    </DesignPage>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  card: { alignSelf: 'stretch' },
  art: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
});
