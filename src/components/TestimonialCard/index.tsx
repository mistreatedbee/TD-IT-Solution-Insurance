export type TestimonialCardProps = {
  /** The testimonial text, shown in italics. */
  quote: string;
  /** Name of the person giving the testimonial. */
  authorName: string;
  /** Job title of the author. */
  authorTitle?: string;
  /** Company the author represents. */
  company?: string;
  /** URL of the author's avatar. Falls back to initials when omitted. */
  avatarUrl?: string;
  /** URL of the client logo, rendered in monochrome. */
  logoUrl?: string;
  /** Accessible label / alt text for the client logo. */
  logoAlt?: string;
  className?: string;
};

// react-refresh/only-export-components: intentionally left as a warning.
// `getInitials` is documented as a reusable export of this module
// (see Context.md "Exports getInitials(name) for reuse") and is small
// enough that a dedicated file would be overkill.
export function getInitials(name: string): string {
  return name.
  trim().
  split(/\s+/).
  slice(0, 2).
  map((part) => part.charAt(0).toUpperCase()).
  join('');
}

export function TestimonialCard({
  quote,
  authorName,
  authorTitle,
  company,
  avatarUrl,
  logoUrl,
  logoAlt,
  className = ''
}: TestimonialCardProps) {
  const meta = [authorTitle, company].filter(Boolean).join(', ');

  return (
    <figure
      className={`relative flex h-full w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 ${className}`}>
      
      {logoUrl ?
      <img
        src={logoUrl}
        alt={logoAlt ?? (company ? `${company} logo` : 'Client logo')}
        className="mb-6 h-7 w-auto max-w-[140px] object-contain opacity-60 grayscale" /> :

      null}

      <blockquote className="relative flex-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-1 -top-6 select-none font-serif text-7xl leading-none text-slate-300 sm:-top-7 sm:text-8xl">
          
          &ldquo;
        </span>
        <p className="relative text-base italic leading-relaxed text-slate-700 sm:text-lg">
          {quote}
        </p>
      </blockquote>

      <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-6">
        {avatarUrl ?
        <img
          src={avatarUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-full object-cover" /> :


        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
          
            {getInitials(authorName)}
          </span>
        }
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {authorName}
          </span>
          {meta ?
          <span className="block truncate text-sm text-slate-500">{meta}</span> :
          null}
        </span>
      </figcaption>
    </figure>);

}