import { useEffect, useRef, useState } from 'react';
import { Avatar, Button } from '../../components';
import { InlineAlert } from '../../dashboard/components/ui';
import {
  deleteProfilePicture,
  fetchProfilePictureBlob,
  uploadProfilePicture,
} from '../../customer/api/profile';
import { mapUserFacingError } from '../../lib/user-facing-errors';

function mapFileType(file: File): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  switch (file.type) {
    case 'image/jpeg':
    case 'image/png':
    case 'image/webp':
      return file.type;
    default:
      return null;
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] ?? '' : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

export interface ProfilePictureControlProps {
  profilePictureUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  onUpdated?: (profilePictureUrl: string | null) => void;
}

export function ProfilePictureControl({
  profilePictureUrl,
  firstName,
  lastName,
  email,
  onUpdated,
}: ProfilePictureControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function loadPreview() {
      if (!profilePictureUrl) {
        setPreviewUrl(null);
        return;
      }

      try {
        const blob = await fetchProfilePictureBlob(profilePictureUrl);
        if (cancelled) return;
        if (!blob) {
          setPreviewUrl(null);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profilePictureUrl]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);

    if (file.size > 512 * 1024) {
      setError('Profile picture must be 512 KB or smaller.');
      return;
    }

    const contentType = mapFileType(file);
    if (!contentType) {
      setError('Please choose a JPEG, PNG, or WebP image.');
      return;
    }

    setIsUploading(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const updated = await uploadProfilePicture({ contentType, imageBase64 });
      onUpdated?.(updated.profilePictureUrl);
    } catch (err) {
      setError(mapUserFacingError(err));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setIsRemoving(true);
    try {
      const updated = await deleteProfilePicture();
      onUpdated?.(updated.profilePictureUrl);
    } catch (err) {
      setError(mapUserFacingError(err));
    } finally {
      setIsRemoving(false);
    }
  }

  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || email || 'Account';

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <Avatar src={previewUrl ?? undefined} name={displayName} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">Profile picture</p>
          <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
            Upload a square photo for your account. JPEG, PNG, or WebP up to 512 KB.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void handleFileChange(event)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={isUploading || isRemoving}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? 'Uploading…' : 'Upload photo'}
          </Button>
          {profilePictureUrl ? (
            <Button
              variant="tertiary"
              size="sm"
              disabled={isUploading || isRemoving}
              onClick={() => void handleRemove()}
            >
              {isRemoving ? 'Removing…' : 'Remove photo'}
            </Button>
          ) : null}
        </div>
        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      </div>
    </div>
  );
}
