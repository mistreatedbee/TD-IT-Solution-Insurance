/**
 * Renders an MFA enrollment QR code from `/mfa/enroll`'s `qrCodeImage` field.
 *
 * Format-detection-robust by design: GoTrue's TOTP enrollment response
 * actually carries an SVG QR code (`totp.qr_code`), not the base64-encoded
 * PNG the field name implies (see `backend/src/routes/mfa.ts`'s NOTE on
 * `qrCodeImage`, and MP-017's confirmed-live rendering bug). Rather than
 * hardcode one assumption, detect the payload shape at render time so this
 * keeps working if the backend's exact encoding changes again:
 *   - raw SVG markup (`<svg ...>` / `<?xml ...>`)               -> SvgXml
 *   - a full data: URI (already has its own mime type)          -> <Image>
 *   - a bare base64 blob (legacy/fallback assumption: PNG)      -> <Image>
 *
 * The manual-entry key is always rendered alongside this as a first-class
 * fallback, never hidden behind a successful QR render — see the calling
 * screens.
 */
import React, { useMemo } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { SvgXml } from 'react-native-svg';

type QrPayloadKind = 'svg' | 'data-uri' | 'base64-png' | 'empty';

export function detectQrPayloadKind(raw: string | null | undefined): QrPayloadKind {
  const value = (raw ?? '').trim();
  if (!value) return 'empty';
  if (value.startsWith('<svg') || value.startsWith('<?xml')) return 'svg';
  if (value.startsWith('data:')) return 'data-uri';
  return 'base64-png';
}

export function MfaQrCode({
  value,
  size = 200,
  style,
}: {
  value: string | null | undefined;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const kind = useMemo(() => detectQrPayloadKind(value), [value]);

  if (kind === 'empty') {
    return null;
  }

  if (kind === 'svg') {
    return (
      <View accessible accessibilityLabel="QR code for authenticator app" style={{ width: size, height: size }}>
        <SvgXml xml={value as string} width={size} height={size} />
      </View>
    );
  }

  const uri = kind === 'data-uri' ? (value as string) : `data:image/png;base64,${value}`;

  return (
    <Image
      accessibilityLabel="QR code for authenticator app"
      source={{ uri }}
      style={[styles.image, { width: size, height: size }, style]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: 200,
    height: 200,
  },
});
