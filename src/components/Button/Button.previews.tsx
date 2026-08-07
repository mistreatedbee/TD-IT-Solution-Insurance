import { ArrowRightIcon, DownloadIcon } from 'lucide-react';
import { Button } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'Button',
  importPath: 'components/Button',
  previews: [
  {
    name: 'Primary',
    description: 'Navy-to-gold gradient pill used for the main call to action.',
    render: () =>
    <div className="flex flex-wrap items-center gap-4">
          <Button size="sm">Get started</Button>
          <Button>Get started</Button>
          <Button size="lg" trailingIcon={<ArrowRightIcon className="h-4 w-4" />}>
            Book a consult
          </Button>
        </div>

  },
  {
    name: 'Secondary & Tertiary',
    description: 'Outlined navy button and text-only link button.',
    render: () =>
    <div className="flex flex-wrap items-center gap-4">
          <Button variant="secondary">Our services</Button>
          <Button variant="secondary" leadingIcon={<DownloadIcon className="h-4 w-4" />}>
            Download brief
          </Button>
          <Button variant="tertiary">Learn more</Button>
        </div>

  },
  {
    name: 'Ghost on dark',
    description: 'Reversed white-on-navy treatment for dark or gradient surfaces.',
    render: () =>
    <div className="flex w-full flex-wrap items-center justify-center gap-4 rounded-xl bg-slate-900 p-8">
          <Button variant="ghost">Talk to us</Button>
          <Button variant="ghost" size="lg" trailingIcon={<ArrowRightIcon className="h-4 w-4" />}>
            View case studies
          </Button>
        </div>

  },
  {
    name: 'Loading & disabled',
    description: 'Busy and non-interactive states across variants.',
    render: () =>
    <div className="flex flex-wrap items-center gap-4">
          <Button loading>Submitting</Button>
          <Button variant="secondary" disabled>
            Unavailable
          </Button>
          <Button variant="tertiary" disabled>
            Learn more
          </Button>
        </div>

  },
  {
    name: 'Full width',
    description: 'Stacked full-width buttons for mobile layouts and forms.',
    render: () =>
    <div className="flex w-64 flex-col gap-3">
          <Button fullWidth>Request a quote</Button>
          <Button variant="secondary" fullWidth>
            Contact support
          </Button>
        </div>

  }]

};

export default previews;