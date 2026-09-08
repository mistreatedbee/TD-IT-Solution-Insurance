import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import {
  useDeleteProfilePictureMutation,
  useUploadProfilePictureMutation,
} from '../../api/hooks/useCustomerProfile';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  prepareProfilePictureFromAsset,
  ProfilePicturePrepareError,
  ProfilePictureTooLargeError,
} from '../../lib/prepareProfilePictureUpload';

const imagePickerOptions = {
  mediaTypes: ['images'] as ImagePicker.MediaType[],
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
  quality: 1,
  ...(Platform.OS === 'ios'
    ? {
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      }
    : {}),
};

async function ensureLibraryPermission(): Promise<boolean> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return permission.granted;
}

async function ensureCameraPermission(): Promise<boolean> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  return permission.granted;
}

export function useProfilePictureUpload() {
  const uploadMutation = useUploadProfilePictureMutation();
  const deleteMutation = useDeleteProfilePictureMutation();

  const uploadFromAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      try {
        const prepared = await prepareProfilePictureFromAsset(asset);
        await uploadMutation.mutateAsync(prepared);
      } catch (error) {
        if (error instanceof ProfilePictureTooLargeError) {
          Alert.alert(
            'Image too large',
            'Please choose a smaller photo. We compress it automatically, but this one is still over 512 KB.',
          );
          return;
        }
        if (error instanceof ProfilePicturePrepareError) {
          Alert.alert('Upload failed', 'Could not read the selected image. Please try another photo.');
          return;
        }
        Alert.alert('Upload failed', mapUserFacingError(error, { context: 'profile' }));
      }
    },
    [uploadMutation],
  );

  const choosePhoto = useCallback(async () => {
    const granted = await ensureLibraryPermission();
    if (!granted) {
      Alert.alert(
        'Photos access needed',
        'Allow photo library access in Settings to choose a profile picture.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync(imagePickerOptions);

    if (result.canceled || !result.assets[0]) return;
    await uploadFromAsset(result.assets[0]);
  }, [uploadFromAsset]);

  const takePhoto = useCallback(async () => {
    const granted = await ensureCameraPermission();
    if (!granted) {
      Alert.alert(
        'Camera access needed',
        Platform.OS === 'ios'
          ? 'Allow camera access in Settings to take a profile picture.'
          : 'Allow camera access to take a profile picture.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync(imagePickerOptions);

    if (result.canceled || !result.assets[0]) return;
    await uploadFromAsset(result.assets[0]);
  }, [uploadFromAsset]);

  const removePhoto = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync();
    } catch (error) {
      Alert.alert('Remove failed', mapUserFacingError(error, { context: 'profile' }));
    }
  }, [deleteMutation]);

  const showPicker = useCallback(() => {
    Alert.alert('Profile picture', 'Choose how you want to update your photo.', [
      { text: 'Choose photo', onPress: () => void choosePhoto() },
      { text: 'Take photo', onPress: () => void takePhoto() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [choosePhoto, takePhoto]);

  return {
    choosePhoto,
    takePhoto,
    removePhoto,
    showPicker,
    isUploading: uploadMutation.isPending,
    isRemoving: deleteMutation.isPending,
  };
}
