import * as ImageManipulator from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

/** Matches backend `PROFILE_PICTURE_MAX_BYTES`. */
export const PROFILE_PICTURE_MAX_BYTES = 512 * 1024;

export type PreparedProfilePicture = {
  contentType: 'image/jpeg';
  imageBase64: string;
};

export class ProfilePictureTooLargeError extends Error {
  constructor() {
    super('PROFILE_PICTURE_TOO_LARGE');
    this.name = 'ProfilePictureTooLargeError';
  }
}

export class ProfilePicturePrepareError extends Error {
  constructor() {
    super('PROFILE_PICTURE_PREPARE_FAILED');
    this.name = 'ProfilePicturePrepareError';
  }
}

function base64ByteLength(base64: string): number {
  const normalized = base64.includes(',') ? base64.split(',').pop()! : base64;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

/**
 * Normalizes library/camera picks to JPEG and compresses under the API limit.
 * iPhone HEIC/HEIF photos are converted here — the backend only accepts JPEG/PNG/WebP.
 */
export async function prepareProfilePictureFromAsset(
  asset: ImagePickerAsset,
): Promise<PreparedProfilePicture> {
  if (!asset.uri) {
    throw new ProfilePicturePrepareError();
  }

  let compress = 0.85;
  let width = 1024;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width } }],
      {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );

    if (!result.base64) {
      throw new ProfilePicturePrepareError();
    }

    if (base64ByteLength(result.base64) <= PROFILE_PICTURE_MAX_BYTES) {
      return { contentType: 'image/jpeg', imageBase64: result.base64 };
    }

    compress -= 0.1;
    if (compress <= 0.55) {
      width = 768;
    }
    if (compress <= 0.45) {
      width = 512;
    }
  }

  throw new ProfilePictureTooLargeError();
}
