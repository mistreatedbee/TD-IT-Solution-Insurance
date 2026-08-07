import React, { useRef, useState } from 'react';
import { useAnimationFrame, useMotionValue } from 'framer-motion';

export type LogoCloudItem = {
  /** Display name of the partner or client. Used as wordmark text and alt text. */
  name: string;
  /** Optional image URL. When omitted, a monochrome placeholder wordmark is rendered. */
  src?: string;
};

export type LogoCloudProps = {
  /** Optional eyebrow heading rendered above the marquee. */
  title?: string;
  /** Logos to display. Defaults to a set of placeholder partner names. */
  logos?: LogoCloudItem[];
  /** Marquee speed in pixels per second. */
  speed?: number;
  /** Scroll direction of the marquee. */
  direction?: 'left' | 'right';
  /** Pause the marquee while the pointer is over it. */
  pauseOnHover?: boolean;
  /** Fade the left and right edges into the background. */
  fadeEdges?: boolean;
  className?: string;
};

// react-refresh/only-export-components: intentionally left as a warning.
// `DEFAULT_LOGOS` is documented, reusable sample data for `LogoCloud`
// consumers (see Context.md); it's small and only meaningful next to the
// component that uses its shape.
export const DEFAULT_LOGOS: LogoCloudItem[] = [
{ name: 'Northwind' },
{ name: 'Acme Corp' },
{ name: 'Globex' },
{ name: 'Initech' },
{ name: 'Umbrella' },
{ name: 'Soylent' },
{ name: 'Vandelay' },
{ name: 'Hooli' }];


function LogoMark({ logo }: {logo: LogoCloudItem;}) {
  if (logo.src) {
    return (
      <img
        src={logo.src}
        alt={logo.name}
        className="h-8 w-auto max-w-[160px] object-contain opacity-60 grayscale transition duration-200 hover:opacity-100 hover:grayscale-0" />);


  }

  return (
    <span className="flex select-none items-center gap-2 whitespace-nowrap text-lg font-semibold tracking-tight text-gray-400 transition-colors duration-200 hover:text-gray-900">
      <span
        aria-hidden="true"
        className="h-6 w-6 shrink-0 rounded-md border-2 border-current" />
      
      {logo.name}
    </span>);

}

export function LogoCloud({
  title,
  logos = DEFAULT_LOGOS,
  speed = 60,
  direction = 'left',
  pauseOnHover = true,
  fadeEdges = true,
  className = ''
}: LogoCloudProps) {
  const items = logos.length > 0 ? logos : DEFAULT_LOGOS;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<HTMLUListElement | null>(null);
  const offset = useMotionValue(0);
  const [paused, setPaused] = useState(false);

  useAnimationFrame((_time, delta) => {
    const group = groupRef.current;
    const track = trackRef.current;
    if (!group || !track) return;
    if (paused) return;

    const width = group.offsetWidth;
    if (width === 0) return;

    const step = speed * delta / 1000;
    let next = offset.get() + (direction === 'left' ? -step : step);

    if (next <= -width) next += width;
    if (next >= 0) next -= width;

    offset.set(next);
    track.style.transform = `translate3d(${next}px, 0, 0)`;
  });

  const maskStyle = fadeEdges ?
  {
    maskImage:
    'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
    WebkitMaskImage:
    'linear-gradient(to right, transparent, black 8%, black 92%, transparent)'
  } :
  undefined;

  const renderGroup = (ref?: React.Ref<HTMLUListElement>, hidden = false) =>
  <ul
    ref={ref}
    aria-hidden={hidden ? true : undefined}
    className="flex shrink-0 list-none items-center gap-12 pr-12">
    
      {items.map((logo, index) =>
    <li key={`${logo.name}-${index}`} className="flex items-center">
          <LogoMark logo={logo} />
        </li>
    )}
    </ul>;


  return (
    <section
      aria-label={title ?? 'Trusted by leading teams'}
      className={`w-full bg-white py-10 ${className}`.trim()}>
      
      {title ?
      <p className="mb-8 px-6 text-center text-xs font-semibold uppercase tracking-widest text-gray-500">
          {title}
        </p> :
      null}

      <div
        className="relative overflow-hidden"
        style={maskStyle}
        onMouseEnter={pauseOnHover ? () => setPaused(true) : undefined}
        onMouseLeave={pauseOnHover ? () => setPaused(false) : undefined}>
        
        <div ref={trackRef} className="flex w-max will-change-transform">
          {renderGroup(groupRef)}
          {renderGroup(undefined, true)}
        </div>
      </div>
    </section>);

}