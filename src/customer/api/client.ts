import { API_BASE_URL } from './config';
import { ApiError, SessionTerminatedError } from './errors';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  authenticated?: boolean;
  _isRetry?: boolean;
}

export interface CustomerClientConfig {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  setRefreshToken: (token: string) => void;
  clearRefreshToken: () => void;
  setAccessToken: (token: string) => void;
  onSessionTerminated: (reason: 'session-invalid' | 'account-suspended') => void;
}

let clientConfig: CustomerClientConfig | null = null;
let refreshInFlight: Promise<string> | null = null;

export function configureCustomerClient(config: CustomerClientConfig): void {
  clientConfig = config;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, authenticated = true } = options;
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (authenticated && clientConfig) {
    const accessToken = clientConfig.getAccessToken();
    if (accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(response.status, {
      error: { message: response.ok ? 'Invalid response from server.' : `Server error (${response.status}). Is the API running?` },
    });
  }

  if (!response.ok) throw new ApiError(response.status, json as import('./errors').ApiErrorBody);

  return json as T;
}

async function refreshAccessToken(): Promise<string> {
  if (!clientConfig) throw new SessionTerminatedError('session-invalid');
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = clientConfig!.getRefreshToken();
    if (!refreshToken) {
      clientConfig!.onSessionTerminated('session-invalid');
      throw new SessionTerminatedError('session-invalid');
    }

    const { getOrCreateWebDeviceId } = await import('../auth/deviceId');

    try {
      const tokens = await rawRequest<{
        accessToken: string;
        refreshToken: string;
        sessionId: string;
      }>('/session/refresh', {
        method: 'POST',
        body: { refreshToken, deviceId: getOrCreateWebDeviceId() },
        authenticated: false,
      });
      clientConfig!.setAccessToken(tokens.accessToken);
      clientConfig!.setRefreshToken(tokens.refreshToken);
      return tokens.accessToken;
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        clientConfig!.onSessionTerminated('account-suspended');
        throw new SessionTerminatedError('account-suspended');
      }
      if (err instanceof ApiError && err.status === 401) {
        clientConfig!.onSessionTerminated('session-invalid');
        throw new SessionTerminatedError('session-invalid');
      }
      throw err;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = true } = options;
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    const shouldRefresh =
      authenticated &&
      !options._isRetry &&
      err instanceof ApiError &&
      err.status === 401 &&
      path !== '/session/refresh';
    if (!shouldRefresh) throw err;
    await refreshAccessToken();
    return rawRequest<T>(path, { ...options, _isRetry: true });
  }
}
