import { Avatar } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'Avatar',
  importPath: 'components/Avatar',
  previews: [
  {
    name: 'Initials',
    description: 'Placeholder headshot with initials on an electric-blue tint.',
    render: () => <Avatar name="Dana Torres" />
  },
  {
    name: 'Fallback glyph',
    description: 'No name or image provided.',
    render: () => <Avatar />
  },
  {
    name: 'Sizes',
    description: 'Small, medium, and large avatars.',
    render: () =>
    <div className="flex items-center gap-4">
          <Avatar name="Ana Lee" size="sm" />
          <Avatar name="Ana Lee" size="md" />
          <Avatar name="Ana Lee" size="lg" />
        </div>

  },
  {
    name: 'Testimonial author',
    description: 'Used alongside a testimonial author block.',
    render: () =>
    <div className="flex items-center gap-3">
          <Avatar name="Marcus Hale" size="md" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Marcus Hale</p>
            <p className="text-sm text-gray-500">IT Director, Northwind</p>
          </div>
        </div>

  }]

};

export default previews;