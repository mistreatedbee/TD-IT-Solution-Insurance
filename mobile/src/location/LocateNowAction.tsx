/**
 * "Locate now" button + live status line (owner-test, FEATURE_REMOTE_LOCATE_ENABLED). Composes
 * the design-system Button with a token-styled status line (same pattern as
 * LocationReportStatusLine); no new visual primitive.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../design';
import { useDesignTokens } from '../theme/designTheme';
import { locateNowMessage, useLocateNow } from './useLocateNow';

export function LocateNowAction({
  assetId,
  onAnswered,
  testID = 'locate-now',
}: {
  assetId: string;
  onAnswered?: () => void | Promise<unknown>;
  testID?: string;
}) {
  const t = useDesignTokens();
  const { state, locate } = useLocateNow(assetId, onAnswered);
  const message = locateNowMessage(state);
  return (
    <View testID={testID} style={{ gap: t.spacing.s2, alignSelf: 'stretch' }}>
      <Button
        label="Locate now"
        variant="secondary"
        loading={state.kind === 'asking'}
        onPress={() => void locate()}
        accessibilityHint="Asks your phone that is linked to this asset to send its current location"
      />
      {message ? (
        <Text accessibilityLiveRegion="polite" style={{ ...t.type.bodySm, color: t.colors.inkMuted }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
