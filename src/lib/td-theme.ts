/** Day/Night for the TD design system. Sets data-theme on <html>; default is "day". */
export type TdTheme = 'day' | 'night';

export function setTdTheme(theme: TdTheme): void {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme);
}

export function getTdTheme(): TdTheme {
  if (typeof document === 'undefined') return 'day';
  return document.documentElement.getAttribute('data-theme') === 'night' ? 'night' : 'day';
}
