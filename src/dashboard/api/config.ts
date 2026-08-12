const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!rawBaseUrl && import.meta.env.DEV) {
  console.warn(
    '[dashboard/api] VITE_API_BASE_URL is not set. Falling back to http://localhost:3000.',
  );
}

export const API_HOST = rawBaseUrl ?? 'http://localhost:3000';
export const API_BASE_URL = `${API_HOST}/api/v1`;
