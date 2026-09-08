import type { ImagePickerAsset } from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  prepareProfilePictureFromAsset,
  ProfilePicturePrepareError,
  ProfilePictureTooLargeError,
} from '../prepareProfilePictureUpload';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(),
}));

const manipulateAsync = ImageManipulator.manipulateAsync as jest.MockedFunction<
  typeof ImageManipulator.manipulateAsync
>;

const asset: ImagePickerAsset = {
  assetId: 'test',
  uri: 'file:///photo.heic',
  width: 2000,
  height: 2000,
};

describe('prepareProfilePictureFromAsset', () => {
  beforeEach(() => {
    manipulateAsync.mockReset();
  });

  it('returns JPEG payload under the size limit', async () => {
    manipulateAsync.mockResolvedValue({
      uri: 'file:///photo.jpg',
      base64: 'aGVsbG8=',
      width: 1024,
      height: 1024,
    });

    const prepared = await prepareProfilePictureFromAsset(asset);

    expect(prepared).toEqual({
      contentType: 'image/jpeg',
      imageBase64: 'aGVsbG8=',
    });
    expect(manipulateAsync).toHaveBeenCalled();
  });

  it('throws when the asset has no uri', async () => {
    await expect(
      prepareProfilePictureFromAsset({ ...asset, uri: '' }),
    ).rejects.toBeInstanceOf(ProfilePicturePrepareError);
  });

  it('throws when compression cannot reach the size limit', async () => {
    const hugeBase64 = 'A'.repeat(700_000);
    manipulateAsync.mockResolvedValue({
      uri: 'file:///photo.jpg',
      base64: hugeBase64,
      width: 512,
      height: 512,
    });

    await expect(prepareProfilePictureFromAsset(asset)).rejects.toBeInstanceOf(
      ProfilePictureTooLargeError,
    );
  });
});
