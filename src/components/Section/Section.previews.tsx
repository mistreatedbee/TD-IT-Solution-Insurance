import { Section } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const SampleContent = ({ title }: {title: string;}) =>
<div className="max-w-2xl">
    <h2 className="text-3xl font-semibold tracking-tight text-gray-900">
      {title}
    </h2>
    <p className="mt-4 text-base leading-relaxed text-gray-600">
      Managed IT, cloud, and cybersecurity services that keep your business
      running. Sections alternate backgrounds to separate content on long pages.
    </p>
  </div>;


const previews: ComponentPreviewModule = {
  componentName: 'Section',
  importPath: 'components/Section',
  previews: [
  {
    name: 'Default (white)',
    description: 'White background with the standard 80px / 120px rhythm.',
    render: () =>
    <Section>
          <SampleContent title="Built for uptime" />
        </Section>

  },
  {
    name: 'Warm background',
    description: 'Warm gray background used for alternating sections.',
    render: () =>
    <Section background="warm">
          <SampleContent title="Proactive monitoring" />
        </Section>

  },
  {
    name: 'Alternating stack',
    description: 'Two sections stacked to show the alternating rhythm.',
    render: () =>
    <div className="w-full">
          <Section>
            <SampleContent title="Managed services" />
          </Section>
          <Section background="warm">
            <SampleContent title="Cloud migration" />
          </Section>
        </div>

  },
  {
    name: 'Compact & narrow',
    description: 'Tighter vertical spacing with a narrow reading width.',
    render: () =>
    <Section background="warm" spacing="compact" width="narrow">
          <SampleContent title="Talk to an engineer" />
        </Section>

  }]

};

export default previews;