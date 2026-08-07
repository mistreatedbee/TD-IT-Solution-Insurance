import { BuildingIcon, type LucideIcon } from "lucide-react";
export type IndustryCardAccent = 'blue' | 'green' | 'amber' | 'purple' | 'red' | 'slate';
export interface IndustryCardProps {
  /** Industry name shown as the card title. */
  title: string;
  /** Short supporting copy describing the industry vertical. */
  description: string;
  /** Lucide icon rendered above the title. */
  icon?: LucideIcon;
  /** Color of the top accent bar and icon. */
  accent?: IndustryCardAccent;
  /** Optional click handler. Renders the card as a button when provided. */
  onClick?: () => void;
  /** Additional class names for the card root. */
  className?: string;
}
const accentBarStyles: Record<IndustryCardAccent, string> = {
  blue: 'bg-blue-600',
  green: 'bg-emerald-600',
  amber: 'bg-amber-500',
  purple: 'bg-violet-600',
  red: 'bg-red-600',
  slate: 'bg-slate-700'
};
const accentIconStyles: Record<IndustryCardAccent, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  purple: 'bg-violet-50 text-violet-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-700'
};
export function IndustryCard({
  title,
  description,
  icon: IconComponent = BuildingIcon,
  accent = 'blue',
  onClick,
  className = ''
}: IndustryCardProps) {
  const isInteractive = typeof onClick === 'function';
  const Root = isInteractive ? 'button' : 'div';
  return <Root type={isInteractive ? 'button' : undefined} onClick={onClick} className={['group relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition', isInteractive ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2' : '', className].filter(Boolean).join(' ')}>
      <span aria-hidden="true" className={`block h-1.5 w-full ${accentBarStyles[accent]}`} />
      <div className="p-6">
        <span className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-md ${accentIconStyles[accent]}`}>
          <IconComponent className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {description}
        </p>
      </div>
    </Root>;
}