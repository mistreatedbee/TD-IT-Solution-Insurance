/**
 * The localStorage key `CustomerAuthProvider` reads/writes the customer web
 * session's refresh token under. Split into its own leaf module (no other
 * imports) so `dashboard/auth/roleRouting.ts`'s `clearOtherRoleSessions`
 * (SR-LU-4: docs/features/001-authentication/security-review-login-unification.md)
 * can reference the same constant `CustomerAuthProvider.tsx` uses, without
 * creating a circular import between the two providers — `CustomerAuthProvider`
 * itself also needs `clearOtherRoleSessions` from `roleRouting.ts`.
 */
export const CUSTOMER_REFRESH_STORAGE_KEY = 'td-customer-web-refresh';
