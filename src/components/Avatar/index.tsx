import React from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  /** Image URL for the headshot. When omitted, initials or a fallback glyph are shown. */
  src?: string;
  /** Full name of the person, used for alt text and initials. */
  name?: string;
  /** Size of the avatar. */
  size?: AvatarSize;
  /** Additional class names for the root element. */
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-base'
};

// react-refresh/only-export-components: intentionally left as a warning.
// `getInitials` is a small, side-effect-free helper used only by `Avatar`
// itself; splitting it into its own file for fast-refresh purity would add
// an extra file/import for a two-line function with no real benefit.
export function getInitials(name?: string): string {
  if (!name) return '';
  return name.
  trim().
  split(/\s+/).
  slice(0, 2).
  map((part) => part[0]?.toUpperCase() ?? '').
  join('');
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const initials = getInitials(name);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-secondary-tint font-semibold uppercase tracking-wide text-secondary ring-1 ring-inset ring-secondary/20 ${sizeClasses[size]} ${className}`}
      role={showImage ? undefined : 'img'}
      aria-label={showImage ? undefined : name || 'User avatar'}>
      
      {showImage ?
      <img
        src={src}
        alt={name ? `${name}'s headshot` : 'User headshot'}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)} /> :

      initials ?
      <span aria-hidden="true">{initials}</span> :

      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-2/3 w-2/3 text-secondary/60"
        aria-hidden="true">
        
          <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.418 0-8 2.686-8 6v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-3.314-3.582-6-8-6Z" />
        </svg>
      }
    </span>);

}