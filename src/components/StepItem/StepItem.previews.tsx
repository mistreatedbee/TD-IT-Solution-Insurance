import { SearchIcon, FileTextIcon, WrenchIcon, ShieldCheckIcon } from 'lucide-react';
import { StepItem } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'StepItem',
  importPath: 'components/StepItem',
  previews: [
  {
    name: 'Default',
    description: 'Single step with watermark numeral and dashed connector.',
    render: () =>
    <ol className="flex w-full max-w-sm list-none">
          <StepItem
        step={1}
        title="Discovery Call"
        description="We map your current stack, pain points, and growth plans in a 30-minute session." />
      
        </ol>

  },
  {
    name: 'Full timeline',
    description: 'Four steps across, with icons and animated connectors.',
    render: () =>
    <ol className="flex w-full list-none flex-col gap-12 bg-background lg:flex-row lg:gap-6">
          <StepItem
        step={1}
        title="Discovery Call"
        description="We map your stack, pain points, and growth plans."
        icon={<SearchIcon className="h-5 w-5" aria-hidden="true" />}
        orientation="vertical"
        delay={0} />
      
          <StepItem
        step={2}
        title="Tailored Proposal"
        description="A fixed-scope plan with clear timelines and pricing."
        icon={<FileTextIcon className="h-5 w-5" aria-hidden="true" />}
        orientation="vertical"
        isActive
        delay={0.1} />
      
          <StepItem
        step={3}
        title="Implementation"
        description="Our engineers deploy and migrate with zero downtime."
        icon={<WrenchIcon className="h-5 w-5" aria-hidden="true" />}
        orientation="vertical"
        delay={0.2} />
      
          <StepItem
        step={4}
        title="Ongoing Support"
        description="24/7 monitoring and a dedicated account engineer."
        icon={<ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />}
        orientation="vertical"
        isLast
        delay={0.3} />
      
        </ol>

  },
  {
    name: 'Active / Last',
    description: 'Active highlight and the final step without a connector.',
    render: () =>
    <ol className="flex w-full max-w-sm list-none">
          <StepItem
        step={4}
        title="Ongoing Support"
        description="24/7 monitoring, patching, and a dedicated account engineer."
        icon={<ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />}
        isActive
        isLast />
      
        </ol>

  }]

};

export default previews;