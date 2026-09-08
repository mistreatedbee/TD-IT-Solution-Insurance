import { CameraIcon, ImageIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveProfilePictureUrl } from '../api/customer-profile';
import { useSessionStore } from '../auth/session-store';
import { colors, minTouchTarget, spacing, typography } from '../theme/tokens';

export type ProfileAvatarSize = 'md' | 'lg';

const sizeMap: Record<ProfileAvatarSize, number> = {
  md: 52,
  lg: 72,
};

export interface ProfileAvatarProps {
  initials: string;
  profilePictureUrl?: string | null;
  size?: ProfileAvatarSize;
  editable?: boolean;
  loading?: boolean;
  onPress?: () => void;
}

export function ProfileAvatar({
  initials,
  profilePictureUrl,
  size = 'md',
  editable = false,
  loading = false,
  onPress,
}: ProfileAvatarProps) {
  const dimension = sizeMap[size];
  const accessToken = useSessionStore((state) => state.accessToken);
  const imageUri = resolveProfilePictureUrl(profilePictureUrl);

  const imageSource = useMemo(() => {
    if (!imageUri || !accessToken) return null;
    return {
      uri: imageUri,
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  }, [accessToken, imageUri]);

  const content = (
    <View
      style={[
        styles.avatar,
        { width: dimension, height: dimension, borderRadius: dimension / 2 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.textInverse} />
      ) : imageSource ? (
        <Image source={imageSource} style={styles.image} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={[styles.initials, size === 'lg' ? styles.initialsLg : null]}>{initials}</Text>
      )}
      {editable ? (
        <View style={styles.editBadge}>
          <CameraIcon size={12} color={colors.textPrimary} strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change profile picture"
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

export function ProfilePictureActions({
  onChoosePhoto,
  onTakePhoto,
  onRemovePhoto,
  hasPhoto,
  disabled = false,
}: {
  onChoosePhoto: () => void;
  onTakePhoto: () => void;
  onRemovePhoto: () => void;
  hasPhoto: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onChoosePhoto}
        style={[styles.actionButton, disabled ? styles.actionDisabled : null]}
      >
        <ImageIcon size={16} color={colors.primary} strokeWidth={2.2} />
        <Text style={styles.actionText}>Choose photo</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onTakePhoto}
        style={[styles.actionButton, disabled ? styles.actionDisabled : null]}
      >
        <CameraIcon size={16} color={colors.primary} strokeWidth={2.2} />
        <Text style={styles.actionText}>Take photo</Text>
      </Pressable>
      {hasPhoto ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onRemovePhoto}
          style={[styles.actionButton, disabled ? styles.actionDisabled : null]}
        >
          <Text style={styles.removeText}>Remove photo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initials: {
    color: colors.textInverse,
    fontSize: typography.sizes.base,
    fontWeight: '700',
  },
  initialsLg: {
    fontSize: typography.sizes.xl,
  },
  editBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  removeText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.fieldErrorText,
  },
});
