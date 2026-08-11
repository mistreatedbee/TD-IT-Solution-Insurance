/**
 * API host configuration — architecture.md §2.1.
 *
 * `EXPO_PUBLIC_API_BASE_URL` is a host URL (e.g. "http://localhost:3000"),
 * not a secret — inlined at build time by Expo's own `EXPO_PUBLIC_`
 * convention, mirroring the web app's `VITE_API_BASE_URL` pattern. The
 * `/api/v1` prefix is ratified platform-wide (api-design.md §6) and is not
 * environment-configurable, so it's appended here rather than baked into
 * the env var.
 */

const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!rawBaseUrl) {
  // Fail loudly rather than silently pointing at nothing — a missing env
  // var here would otherwise surface as a confusing network error deep
  // inside the first API call instead of at startup.
  console.warn(
    '[api/config] EXPO_PUBLIC_API_BASE_URL is not set. Copy mobile/.env.example ' +
      'to mobile/.env and set it, or every API call will fail. Falling back to ' +
      'http://localhost:3000 for local development.',
  );
}

export const API_HOST = rawBaseUrl ?? 'http://localhost:3000';
export const API_BASE_URL = `${API_HOST}/api/v1`;
