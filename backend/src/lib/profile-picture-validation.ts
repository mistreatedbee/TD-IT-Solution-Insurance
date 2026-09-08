import { z } from 'zod';

export const PROFILE_PICTURE_MAX_BYTES = 512 * 1024;

export const ALLOWED_PROFILE_PICTURE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ProfilePictureContentType = (typeof ALLOWED_PROFILE_PICTURE_CONTENT_TYPES)[number];

export const uploadProfilePictureBodySchema = z
  .object({
    contentType: z.enum(ALLOWED_PROFILE_PICTURE_CONTENT_TYPES),
    imageBase64: z.string().min(1).max(700_000),
  })
  .strict();

export type UploadProfilePictureBody = z.infer<typeof uploadProfilePictureBodySchema>;

export function decodeProfilePictureBase64(imageBase64: string): Buffer {
  const normalized = imageBase64.includes(',') ? imageBase64.split(',').pop()! : imageBase64;
  return Buffer.from(normalized, 'base64');
}

export function detectProfilePictureContentType(buffer: Buffer): ProfilePictureContentType | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function validateProfilePictureBuffer(
  buffer: Buffer,
  declaredContentType: ProfilePictureContentType,
): void {
  if (buffer.length === 0) {
    throw new Error('PROFILE_PICTURE_EMPTY');
  }

  if (buffer.length > PROFILE_PICTURE_MAX_BYTES) {
    throw new Error('PROFILE_PICTURE_TOO_LARGE');
  }

  const detected = detectProfilePictureContentType(buffer);
  if (!detected || detected !== declaredContentType) {
    throw new Error('PROFILE_PICTURE_INVALID');
  }
}
