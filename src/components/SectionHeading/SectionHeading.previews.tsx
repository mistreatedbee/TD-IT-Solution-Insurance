import { SectionHeading } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'SectionHeading',
  importPath: 'components/SectionHeading',
  previews: [
  {
    name: 'Default',
    description: 'Eyebrow, title and subtitle aligned left.',
    render: () =>
    <SectionHeading
      eyebrow="Managed IT"
      title="Technology that keeps your business running"
      subtitle="Proactive monitoring, rapid support, and a roadmap tailored to how your team actually works." />


  },
  {
    name: 'Centered',
    description: 'Centered variant for full-width marketing sections.',
    render: () =>
    <SectionHeading
      align="center"
      size="lg"
      eyebrow="Our services"
      title="One partner for every layer of your stack"
      subtitle="From helpdesk to cloud migrations, we cover the work that keeps operations steady." />


  },
  {
    name: 'With actions',
    description: 'Left aligned with a trailing action.',
    render: () =>
    <SectionHeading
      eyebrow="Case studies"
      title="Results from teams like yours"
      subtitle="Real deployments, measured outcomes."
      actions={
      <button
        type="button"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold-deep focus-visible:ring-offset-2">
        
              View all
            </button>
      } />


  },
  {
    name: 'Dark tone',
    description: 'For use on dark section backgrounds.',
    render: () =>
    <div className="w-full rounded-lg bg-slate-900 p-8">
          <SectionHeading
        tone="dark"
        eyebrow="Security"
        title="Defense in depth, without the friction"
        subtitle="Endpoint protection, identity controls, and continuous compliance reporting." />
      
        </div>

  }]

};

export default previews;