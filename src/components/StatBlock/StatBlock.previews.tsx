import { StatBlock } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'StatBlock',
  importPath: 'components/StatBlock',
  previews: [
  {
    name: 'Default',
    description: 'Large navy numeral with uppercase label and accent underline.',
    render: () => <StatBlock value={1250} suffix="+" label="Devices managed" />
  },
  {
    name: 'Centered with prefix',
    description: 'Centered alignment, currency prefix and decimal precision.',
    render: () =>
    <StatBlock value={2.4} prefix="$" suffix="M" decimals={1} label="Annual savings" align="center" />

  },
  {
    name: 'Stat row',
    description: 'Three medium stats laid out in a responsive row.',
    render: () =>
    <div className="grid w-full grid-cols-1 gap-10 sm:grid-cols-3">
          <StatBlock size="md" value={99.9} decimals={1} suffix="%" label="Uptime" />
          <StatBlock size="md" value={15} suffix=" min" label="Response time" />
          <StatBlock size="md" value={340} suffix="+" label="Clients served" />
        </div>

  },
  {
    name: 'Static (no animation)',
    description: 'Renders the final value immediately, for print or reduced-motion contexts.',
    render: () => <StatBlock value={87} suffix="%" label="Tickets resolved first call" animate={false} />
  }]

};

export default previews;