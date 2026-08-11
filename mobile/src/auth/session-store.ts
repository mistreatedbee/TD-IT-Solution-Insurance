/**
 * In-memory session state — architecture.md §2.3/§4.1.
 *
 * Access token lives ONLY here (a plain in-memory value, never persisted).
 * The refresh token lives ONLY in SecureStore (secure-storage.ts).
 *
 * `account` is a cache for DISPLAY purposes only (e.g. showing an email on
 * a profile screen while offline) — per architecture.md §2.3, it must
 * NEVER be used as the basis for an authorization/gating decision. Gating
 * logic (the (auth) vs. verification-gate vs. (app) route decision) must
 * always go through a fresh `GET /account/me` call at the points that
 * matter (app foreground-resume, before rendering the gated home screen),
 * not read `account` here.
 */
import { create } from 'zustand';
import type { components } from '../api/generated/identity-service';

export type Account = components['schemas']['Account'];

export type SessionStatus =
  | 'hydrating' // app just launched, attempting silent /session/refresh
  | 'signed-out'
  | 'signed-in';

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  sessionId: string | null;
  /** Display-only cache — see file header. Never used for gating. */
  account: Account | null;
  setHydrating: () => void;
  setSignedIn: (params: { accessToken: string; sessionId: string }) => void;
  setAccessToken: (accessToken: string) => void;
  setAccount: (account: Account | null) => void;
  setSignedOut: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'hydrating',
  accessToken: null,
  sessionId: null,
  account: null,
  setHydrating: () => set({ status: 'hydrating' }),
  setSignedIn: ({ accessToken, sessionId }) =>
    set({ status: 'signed-in', accessToken, sessionId }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setAccount: (account) => set({ account }),
  setSignedOut: () =>
    set({ status: 'signed-out', accessToken: null, sessionId: null, account: null }),
}));

/** Non-hook accessor for use inside src/api/client.ts (outside React). */
export const sessionStore = {
  getState: useSessionStore.getState,
  setState: useSessionStore.setState,
};
