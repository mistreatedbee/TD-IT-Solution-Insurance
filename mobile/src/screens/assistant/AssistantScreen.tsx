/**
 * Feature 024 Phase 1a — "TD IT Solutions Insurance assistant" shell (owner-test only,
 * FEATURE_ASSISTANT_ENTRY_ENABLED). The assistant itself is NOT built: there is no backend and
 * no ratified ADR for an AI vendor (024 README §11 ruling 2), so this screen makes no AI or
 * network calls. It shows an honest coming-soon state, the emergency banner and the Talk to
 * support entry, which never depends on the assistant.
 */
import { useRouter, type Href } from 'expo-router';
import { HeadsetIcon, PhoneIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { DesignPage } from '../../components/DesignPage';
import { FEATURE_THEFT_REPORTING_ENABLED } from '../../config/features';
import { hasAnySupportContact, SUPPORT_CONTACTS } from '../../config/support';
import { Button, GlassCard } from '../../design';
import { SubpageHeader } from '../../navigation/SubpageHeader';
import { useDesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { TalkToSupportSheet } from './TalkToSupportSheet';

export const ASSISTANT_TITLE = 'TD IT Solutions Insurance assistant';

export function AssistantScreen() {
  const router = useRouter();
  const t = useDesignTokens();
  const [supportOpen, setSupportOpen] = useState(false);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        stack: { gap: t.spacing.s4 },
        actions: { gap: t.spacing.s3, marginTop: t.spacing.s3 },
        title: { ...t.type.label, color: t.colors.ink, marginBottom: t.spacing.s2 },
        body: { ...t.type.body, color: t.colors.inkMuted },
      }),
    [t],
  );

  return (
    <DesignPage>
      <SubpageHeader title={ASSISTANT_TITLE} />
      <View style={styles.stack}>
        <GlassCard variant="solid" testID="assistant-emergency-banner">
          <Alert tone="danger" title="Is something being stolen right now?">
            {FEATURE_THEFT_REPORTING_ENABLED
              ? 'Report theft in the app, or call the police on 10111.'
              : 'Call the police on 10111.'}
          </Alert>
          <View style={styles.actions}>
            {FEATURE_THEFT_REPORTING_ENABLED ? (
              <Button
                variant="danger"
                label="Report theft"
                onPress={() => router.push('/(app)/report-theft' as Href)}
              />
            ) : null}
            <Button
              variant="glass"
              label="Call 10111"
              icon={<PhoneIcon size={20} color={t.colors.ink} />}
              onPress={() => void Linking.openURL('tel:10111')}
            />
          </View>
        </GlassCard>

        <Button
          label="Talk to support"
          icon={<HeadsetIcon size={20} color={t.colors.onActionPrimary} />}
          onPress={() => setSupportOpen(true)}
        />

        <GlassCard testID="assistant-coming-soon">
          <Text style={styles.title} accessibilityRole="header">
            The assistant is coming soon
          </Text>
          <Text style={styles.body}>
            You will be able to ask questions about your policy, assets and claims here.
            {hasAnySupportContact(SUPPORT_CONTACTS)
              ? ' Until then, tap Talk to support to reach our team.'
              : ' Support contact details are being set up.'}
          </Text>
        </GlassCard>
      </View>

      <TalkToSupportSheet visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </DesignPage>
  );
}
