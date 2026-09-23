/**
 * Feature 017 D-1 — safe `<img>` `src` construction for `/mfa/enroll`'s
 * `qrCodeSvg` field (raw SVG markup from GoTrue, per
 * `backend/src/routes/mfa.ts`).
 *
 * Deliberately does NOT use `dangerouslySetInnerHTML` to inline this markup
 * — it is third-party (Supabase/GoTrue) content and inlining it into the DOM
 * would let embedded `<script>`/event-handler content execute in this
 * page's origin. An `<img src="data:image/svg+xml;base64,…">` is safe here
 * for a well-understood reason: browsers render an SVG loaded via `<img>` in
 * an "image context" that does not execute embedded scripts or event
 * handlers, unlike inlining the same markup into the document (see
 * ui-design.md §3.3.2, R-2). This module only ever hands the raw string to
 * an `<img>` `src`, never to `innerHTML`.
 */

/** UTF-8-safe base64 encode (plain `btoa` throws on non-Latin1 input). */
function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Returns a safe `data:` URI for the QR `<img>`, or `null` if the payload
 * doesn't look like something we can safely render this way (in which case
 * the caller should fall back to the manual entry key only — never render an
 * unrecognized string as HTML).
 */
export function qrCodeImageSrc(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (value.startsWith('data:image/svg+xml')) return value;
  if (value.startsWith('<svg') || value.startsWith('<?xml')) {
    return `data:image/svg+xml;charset=utf-8;base64,${toBase64Utf8(value)}`;
  }
  // Unrecognized shape (e.g. a future bare-base64-PNG format change) — do
  // not guess a MIME type for unverified content. Manual key stays primary.
  return null;
}
