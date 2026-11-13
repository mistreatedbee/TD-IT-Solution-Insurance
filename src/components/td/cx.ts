export const cx = (...p: Array<string | false | null | undefined>): string => p.filter(Boolean).join(' ');
export const TD_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-td-focus-ring';
