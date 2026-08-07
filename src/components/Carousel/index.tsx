import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType, EmblaOptionsType } from 'embla-carousel';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

export type CarouselApi = EmblaCarouselType;

export interface CarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Embla options (loop, align, dragFree, etc.) */
  options?: EmblaOptionsType;
  /** Show the previous/next arrow buttons */
  showArrows?: boolean;
  /** Show the dot pagination */
  showDots?: boolean;
  /** Called once with the underlying Embla API */
  setApi?: (api: CarouselApi) => void;
  /** Accessible label for the carousel region */
  label?: string;
  children: React.ReactNode;
}

interface CarouselContextValue {
  api: CarouselApi | undefined;
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

// react-refresh/only-export-components: intentionally left as a warning.
// `useCarousel` is the public hook for consuming `Carousel`'s context and
// is meant to be imported alongside the `Carousel` component itself;
// moving it to a separate file would split a tightly-coupled
// component+hook pair across two modules for no real gain.
export function useCarousel(): CarouselContextValue {
  const ctx = useContext(CarouselContext);
  if (!ctx) throw new Error('useCarousel must be used within a <Carousel />');
  return ctx;
}

export function Carousel({
  options,
  showArrows = true,
  showDots = true,
  setApi,
  label = 'Carousel',
  className = '',
  children,
  ...rest
}: CarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    ...options
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback((api: CarouselApi) => {
    setSelected(api.selectedScrollSnap());
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    setSnaps(emblaApi.scrollSnapList());
    onSelect(emblaApi);
    emblaApi.on('select', onSelect).on('reInit', (api) => {
      setSnaps(api.scrollSnapList());
      onSelect(api);
    });
    setApi?.(emblaApi);
  }, [emblaApi, onSelect, setApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext]
  );

  return (
    <CarouselContext.Provider value={{ api: emblaApi }}>
      <section
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={`relative w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 rounded-lg ${className}`}
        {...rest}>
        
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex touch-pan-y -ml-4">{children}</div>
        </div>

        {(showArrows || showDots) &&
        <div className="mt-4 flex items-center justify-between gap-4">
            {showDots && snaps.length > 1 ?
          <div className="flex items-center gap-2" role="tablist" aria-label="Slides">
                {snaps.map((_, index) =>
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === selected}
              aria-label={`Go to slide ${index + 1}`}
              onClick={() => emblaApi?.scrollTo(index)}
              className={`h-2 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
              index === selected ? 'w-6 bg-slate-900' : 'w-2 bg-slate-300 hover:bg-slate-400'}`
              } />

            )}
              </div> :

          <span />
          }

            {showArrows &&
          <div className="flex items-center gap-2">
                <CarouselArrowButton direction="prev" disabled={!canPrev} onClick={scrollPrev} />
                <CarouselArrowButton direction="next" disabled={!canNext} onClick={scrollNext} />
              </div>
          }
          </div>
        }
      </section>
    </CarouselContext.Provider>);

}

interface CarouselArrowButtonProps {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}

export function CarouselArrowButton({ direction, disabled, onClick }: CarouselArrowButtonProps) {
  const Icon = direction === 'prev' ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'Previous slide' : 'Next slide'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2">
      
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>);

}

export interface CarouselItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind basis/width classes controlling how many items are visible, e.g. "basis-full sm:basis-1/2" */
  className?: string;
  children: React.ReactNode;
}

export function CarouselItem({ className = 'basis-full', children, ...rest }: CarouselItemProps) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      className={`min-w-0 shrink-0 grow-0 pl-4 ${className}`}
      {...rest}>
      
      {children}
    </div>);

}