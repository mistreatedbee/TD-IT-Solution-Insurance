import { ArrowLink } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'ArrowLink',
  importPath: 'components/ArrowLink',
  previews: [
  {
    name: 'Default',
    description: 'Standard inline link with an arrow that slides on hover.',
    render: () => <ArrowLink href="#">Learn more</ArrowLink>
  },
  {
    name: 'Sizes',
    description: 'Small, medium, and large scales.',
    render: () =>
    <div className="flex flex-col items-start gap-3">
          <ArrowLink href="#" size="sm">
            Small link
          </ArrowLink>
          <ArrowLink href="#" size="md">
            Medium link
          </ArrowLink>
          <ArrowLink href="#" size="lg">
            Large link
          </ArrowLink>
        </div>

  },
  {
    name: 'Tones',
    description: 'Default and muted tones, plus inverse on a dark surface.',
    render: () =>
    <div className="flex flex-col items-start gap-3">
          <ArrowLink href="#">Default tone</ArrowLink>
          <ArrowLink href="#" tone="muted">
            Muted tone
          </ArrowLink>
          <div className="rounded-md bg-gray-900 px-4 py-3">
            <ArrowLink href="#" tone="inverse">
              Inverse tone
            </ArrowLink>
          </div>
        </div>

  },
  {
    name: 'Reverse and disabled',
    description: 'Back-navigation variant and non-interactive state.',
    render: () =>
    <div className="flex flex-col items-start gap-3">
          <ArrowLink href="#" reverse>
            Back to overview
          </ArrowLink>
          <ArrowLink href="#" disabled>
            Unavailable
          </ArrowLink>
        </div>

  },
  {
    name: 'In a card',
    description: 'Used as a secondary action at the bottom of a card.',
    render: () =>
    <div className="w-72 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">
            Managed IT Support
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Proactive monitoring and helpdesk coverage for your whole team.
          </p>
          <div className="mt-4">
            <ArrowLink href="#">Explore services</ArrowLink>
          </div>
        </div>

  }]

};

export default previews;