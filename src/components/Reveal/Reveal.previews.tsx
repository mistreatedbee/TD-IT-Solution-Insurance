import { Reveal } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const Card = ({ title, body }: {title: string;body: string;}) =>
<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    <p className="mt-2 text-sm text-gray-600">{body}</p>
  </div>;


const previews: ComponentPreviewModule = {
  componentName: 'Reveal',
  importPath: 'components/Reveal',
  previews: [
  {
    name: 'Default',
    description: 'Fade-up reveal on scroll into view.',
    render: () =>
    <div className="w-full max-w-md">
          <Reveal repeat>
            <Card
          title="Managed IT, quietly handled"
          body="Content fades up as it enters the viewport using the site's calm motion timing." />
        
          </Reveal>
        </div>

  },
  {
    name: 'Staggered list',
    description: 'Sequential delays create a soft cascade.',
    render: () =>
    <div className="w-full max-w-md space-y-4">
          {['Network monitoring', 'Cloud migration', 'Cybersecurity'].map((label, i) =>
      <Reveal key={label} delay={i * 0.12} repeat>
              <Card title={label} body="Delay increases by 120ms per item." />
            </Reveal>
      )}
        </div>

  },
  {
    name: 'Directions',
    description: 'Reveal from the left, right, or with no travel.',
    render: () =>
    <div className="w-full max-w-md space-y-4">
          <Reveal direction="left" distance={40} repeat>
            <Card title="From left" body="direction=&quot;left&quot; with distance 40." />
          </Reveal>
          <Reveal direction="right" distance={40} repeat>
            <Card title="From right" body="direction=&quot;right&quot; with distance 40." />
          </Reveal>
          <Reveal direction="none" duration={0.9} repeat>
            <Card title="Fade only" body="direction=&quot;none&quot; for a slow, pure fade." />
          </Reveal>
        </div>

  }]

};

export default previews;