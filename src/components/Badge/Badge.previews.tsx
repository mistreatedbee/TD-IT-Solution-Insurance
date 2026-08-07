import { CheckIcon, ServerIcon } from 'lucide-react';
import { Badge } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'Badge',
  importPath: 'components/Badge',
  previews: [
  {
    name: 'Tones',
    description: 'Neutral, gold accent, and emerald success tones',
    render: () =>
    <div className="flex flex-wrap items-center gap-2">
          <Badge>Hardware</Badge>
          <Badge tone="gold">Premium Plan</Badge>
          <Badge tone="emerald">Active</Badge>
        </div>

  },
  {
    name: 'Sizes',
    description: 'Small (default) and medium sizes',
    render: () =>
    <div className="flex flex-wrap items-center gap-2">
          <Badge size="sm" tone="gold">
            Small
          </Badge>
          <Badge size="md" tone="gold">
            Medium
          </Badge>
        </div>

  },
  {
    name: 'With icons',
    description: 'Badges with a leading icon',
    render: () =>
    <div className="flex flex-wrap items-center gap-2">
          <Badge icon={<ServerIcon className="h-3 w-3" />}>Servers</Badge>
          <Badge tone="emerald" size="md" icon={<CheckIcon className="h-3.5 w-3.5" />}>
            Compliant
          </Badge>
        </div>

  }]

};

export default previews;