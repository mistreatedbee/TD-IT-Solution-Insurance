import { ShieldCheck, MapPin, Clock, MapPinOff, TriangleAlert, CircleCheck, FileText, type LucideIcon } from 'lucide-react';
import { cx } from './cx';

export type TdStatus =
  | 'PROTECTED'
  | 'TRACKING'
  | 'PENDING VERIFICATION'
  | 'LOST'
  | 'STOLEN'
  | 'RECOVERED'
  | 'CLAIM OPEN';

export const TD_STATUSES: readonly TdStatus[] = [
  'PROTECTED',
  'TRACKING',
  'PENDING VERIFICATION',
  'LOST',
  'STOLEN',
  'RECOVERED',
  'CLAIM OPEN',
];

const MAP: Record<TdStatus, { tone: string; Icon: LucideIcon }> = {
  PROTECTED: { tone: 'bg-td-success-bg text-td-success', Icon: ShieldCheck },
  TRACKING: { tone: 'bg-td-info-bg text-td-link', Icon: MapPin },
  'PENDING VERIFICATION': { tone: 'bg-td-warning-bg text-td-warning', Icon: Clock },
  LOST: { tone: 'bg-td-danger-bg text-td-danger', Icon: MapPinOff },
  STOLEN: { tone: 'bg-td-danger-bg text-td-danger', Icon: TriangleAlert },
  RECOVERED: { tone: 'bg-td-success-bg text-td-success', Icon: CircleCheck },
  'CLAIM OPEN': { tone: 'bg-td-info-bg text-td-link', Icon: FileText },
};

export interface TdStatusBadgeProps {
  status: TdStatus;
  className?: string;
}

/** A state label, not a button. Always icon plus word. */
export function TdStatusBadge({ status, className }: TdStatusBadgeProps) {
  const { tone, Icon } = MAP[status];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-[6px] rounded-td-sm px-[10px] py-1 font-td-sans text-[12px] font-bold leading-4 tracking-[0.04em]',
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" strokeWidth={1.75} className="h-[14px] w-[14px] flex-none" />
      {status}
    </span>
  );
}
