/**
 * Single source of design values for backend (domain notification) emails.
 * Mirrors supabase/functions/auth-send-email/templates/brand.ts (Deno, so it cannot import this file).
 * Keep the two in step. Source: the current design system, src/styles/td-tokens.css, "Day" theme.
 * Every text/background pair used here was checked at 4.5:1 or better, in light and dark.
 */
export const EMAIL_COLORS = {
  /** Brand navy: header band, headings. */
  navy: '#2C3E52',
  navyEnd: '#1F2D3D',
  /** Ink: body text on white. */
  ink: '#14202D',
  /** Secondary text on white or the page tone. */
  muted: '#4A5A6C',
  /** Small print on white or on the sunken tint. */
  subtle: '#5B6B7D',
  /** Link text (higher contrast than the brand blue). */
  link: '#1A66A0',
  brandBlue: '#2780B8',
  brandBlueBright: '#4DA6E0',
  orange: '#F5A022',
  page: '#EEF3F8',
  pageTop: '#F7FAFD',
  pageBottom: '#E6EEF6',
  card: '#FFFFFF',
  sunken: '#E3EBF3',
  border: '#D3DEE9',
} as const;

/**
 * Web fonts (Zilla Slab, Plus Jakarta Sans) do not load in most mail clients, so each stack falls
 * back to a font every client has.
 */
export const EMAIL_FONT_DISPLAY = "'Zilla Slab',Rockwell,'Roboto Slab',Georgia,serif";
export const EMAIL_FONT_SANS =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Dark mode for clients that support it (Apple Mail, iOS Mail, Outlook apps): the design system's
 * "Night" theme. Written as attribute selectors on the inline colours so templates need no extra
 * classes. The call-to-action keeps its orange fill and dark text. Clients that ignore it show the
 * light design.
 */
export const EMAIL_DARK_MODE_CSS = `
@media (prefers-color-scheme: dark) {
  [style*="background:#EEF3F8"] { background:#0B1622 !important; background-image:none !important; }
  [style*="background:#FFFFFF"] { background:#14253A !important; }
  [style*="background:#E3EBF3"] { background:#0F1D2C !important; }
  [style*="#D3DEE9"] { border-color:rgba(255,255,255,0.14) !important; }
  [style*="color:#14202D"]:not(a) { color:#F2F6FA !important; }
  [style*="color:#2C3E52"] { color:#F2F6FA !important; }
  [style*="color:#4A5A6C"] { color:#AEBBCA !important; }
  [style*="color:#5B6B7D"] { color:#8FA3B8 !important; }
  [style*="color:#1A66A0"] { color:#7CC0F0 !important; }
}`;
