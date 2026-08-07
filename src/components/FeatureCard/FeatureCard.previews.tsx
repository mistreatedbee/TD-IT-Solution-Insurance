import {
  ArrowRightIcon,
  CloudIcon,
  ShieldCheckIcon,
  HeadphonesIcon } from
'lucide-react';
import { FeatureCard } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'FeatureCard',
  importPath: 'components/FeatureCard',
  previews: [
  {
    name: 'Default',
    description: 'Icon, title, accent rule, and supporting copy.',
    render: () =>
    <div className="max-w-sm">
          <FeatureCard
        icon={ShieldCheckIcon}
        title="Managed Cybersecurity"
        description="Continuous monitoring, endpoint protection, and incident response handled by our in-house security team." />
      
        </div>

  },
  {
    name: 'Centered',
    description: 'Center-aligned variant for balanced feature grids.',
    render: () =>
    <div className="max-w-sm">
          <FeatureCard
        align="center"
        icon={CloudIcon}
        title="Cloud Migration"
        description="Move workloads to Azure or AWS with zero-downtime cutovers and a documented rollback plan." />
      
        </div>

  },
  {
    name: 'Linked with footer',
    description: 'Interactive card with a call-to-action footer.',
    render: () =>
    <div className="max-w-sm">
          <FeatureCard
        href="#support"
        icon={HeadphonesIcon}
        title="24/7 Help Desk"
        description="Unlimited support tickets with a 15-minute average first response, day or night."
        footer={
        <span className="inline-flex items-center gap-1 font-medium text-blue-600">
                Explore support plans
                <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
        } />
      
        </div>

  }]

};

export default previews;