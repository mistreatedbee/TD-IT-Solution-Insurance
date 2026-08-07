import { Logo } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'Logo',
  importPath: 'components/Logo',
  previews: [
  {
    name: 'Default',
    description: 'Full lockup — glyph plus wordmark in primary navy.',
    render: () => <Logo />
  },
  {
    name: 'Sizes',
    description: 'Small, medium, and large scales.',
    render: () =>
    <div className="flex flex-col items-start gap-6">
          <Logo size="sm" />
          <Logo size="md" />
          <Logo size="lg" />
        </div>

  },
  {
    name: 'Variants',
    description: 'Glyph only and wordmark only for tight spaces.',
    render: () =>
    <div className="flex items-center gap-8">
          <Logo variant="glyph" />
          <Logo variant="wordmark" />
        </div>

  },
  {
    name: 'On navy',
    description: 'Light tone for use on dark navy surfaces.',
    render: () =>
    <div className="flex w-full items-center justify-center rounded-md bg-[#0B2A4A] p-8">
          <Logo tone="light" size="lg" />
        </div>

  },
  {
    name: 'As link',
    description: 'Rendered as an anchor with a visible focus ring.',
    render: () => <Logo href="#" />
  }]

};

export default previews;