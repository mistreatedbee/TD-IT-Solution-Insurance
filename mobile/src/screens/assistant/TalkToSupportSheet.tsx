/**
 * Feature 024 Phase 1a (option A) — Call / Email / WhatsApp links. No customer data leaves the
 * app: each option only opens the phone's own dialler, mail app or WhatsApp. Options without a
 * configured value are hidden; with none configured the sheet says so instead of inventing one.
 */
import { MailIcon, MessageCircleIcon, PhoneIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  emailUrl,
  hasAnySupportContact,
  phoneUrl,
  SUPPORT_CONTACTS,
  whatsappUrl,
  type SupportContacts,
} from '../../config/support';
import { Button, GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';

export interface TalkToSupportSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Defaults to the build-time config; injectable for tests. */
  contacts?: SupportContacts;
}

export function TalkToSupportSheet({
  visible,
  onClose,
  contacts = SUPPORT_CONTACTS,
}: TalkToSupportSheetProps) {
  const t = useDesignTokens();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: t.colors.scrim,
          padding: t.spacing.s4,
        },
        title: { ...t.type.displayMd, color: t.colors.ink, marginBottom: t.spacing.s2 },
        body: { ...t.type.body, color: t.colors.inkMuted, marginBottom: t.spacing.s4 },
        options: { gap: t.spacing.s3, marginBottom: t.spacing.s3 },
      }),
    [t],
  );
  const iconColor = t.colors.ink;
  const configured = hasAnySupportContact(contacts);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessible={false}
      >
        {/* Inner Pressable swallows taps so only the dimmed area closes the sheet. */}
        <Pressable onPress={() => undefined} accessible={false}>
          <GlassCard variant="solid" testID="talk-to-support-sheet">
            <Text style={styles.title} accessibilityRole="header">
              Talk to support
            </Text>
            {configured ? (
              <>
                <Text style={styles.body}>Choose how you would like to reach our team.</Text>
                <View style={styles.options}>
                  {contacts.phone ? (
                    <Button
                      variant="glass"
                      label="Call support"
                      icon={<PhoneIcon size={20} color={iconColor} />}
                      onPress={() => void Linking.openURL(phoneUrl(contacts.phone!))}
                    />
                  ) : null}
                  {contacts.email ? (
                    <Button
                      variant="glass"
                      label="Email support"
                      icon={<MailIcon size={20} color={iconColor} />}
                      onPress={() => void Linking.openURL(emailUrl(contacts.email!))}
                    />
                  ) : null}
                  {contacts.whatsapp ? (
                    <Button
                      variant="glass"
                      label="WhatsApp support"
                      icon={<MessageCircleIcon size={20} color={iconColor} />}
                      onPress={() => void Linking.openURL(whatsappUrl(contacts.whatsapp!))}
                    />
                  ) : null}
                </View>
              </>
            ) : (
              <Text style={styles.body}>Support contact details are being set up.</Text>
            )}
            <Button variant="secondary" label="Close" onPress={onClose} />
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
