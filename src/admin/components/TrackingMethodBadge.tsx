import { Clock, MapPin, MapPinOff, Smartphone } from 'lucide-react';
import { Badge } from '../../components';
import type { TrackingMethod } from '../lib/tracking-method';

const ICON = 'h-3.5 w-3.5';

/** Tracking-method badge shared by the admin Assets list and asset detail page. */
export function TrackingMethodBadge({ method }: { method: TrackingMethod }) {
  switch (method) {
    case 'gps_paired':
      return (
        <Badge tone="emerald" icon={<MapPin className={ICON} />}>
          GPS tracker (paired)
        </Badge>
      );
    case 'app':
      return (
        <Badge tone="neutral" icon={<Smartphone className={ICON} />}>
          Our app on the phone
        </Badge>
      );
    case 'software':
      return (
        <Badge tone="neutral" icon={<Clock className={ICON} />}>
          Our software (coming soon)
        </Badge>
      );
    case 'gps_unpaired':
      return (
        <Badge tone="gold" icon={<MapPinOff className={ICON} />}>
          GPS tracker (not paired)
        </Badge>
      );
    default:
      return <Badge tone="neutral">Not tracked</Badge>;
  }
}
