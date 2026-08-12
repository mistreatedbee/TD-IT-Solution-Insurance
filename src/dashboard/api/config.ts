/** Normalize API host for Render blueprint `fromService` host values (hostname only). */
export function normalizeApiHost(raw: string | undefined): string {
  if (!raw?.trim()) return '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const normalized = normalizeApiHost(rawBaseUrl);

if (!normalized && import.meta.env.DEV) {
  console.warn(
    '[dashboard/api] VITE_API_BASE_URL is not set. Falling back to http://localhost:3000.',
  );
}

if (!normalized && import.meta.env.PROD) {
  console.error(
    '[dashboard/api] VITE_API_BASE_URL is required in production builds. ' +
      'Set it in Render (fromService → td-it-insurance-api host).',
  );
}

export const API_HOST = normalized || 'http://localhost:3000';
export const API_BASE_URL = `${API_HOST}/api/v1`;
