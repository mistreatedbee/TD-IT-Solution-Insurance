import { Input } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'Input',
  importPath: 'components/Input',
  previews: [
  {
    name: 'Default',
    description: 'Single-line text field with label',
    render: () =>
    <div style={{ width: '100%', maxWidth: 360 }}>
          <Input label="Full name" placeholder="Jane Doe" />
        </div>

  },
  {
    name: 'Email with hint',
    description: 'Email field with helper text and required marker',
    render: () =>
    <div style={{ width: '100%', maxWidth: 360 }}>
          <Input
        label="Work email"
        type="email"
        required
        placeholder="you@company.com"
        hint="We'll only use this to send your quote." />
      
        </div>

  },
  {
    name: 'Error state',
    description: 'Invalid field with inline error message',
    render: () =>
    <div style={{ width: '100%', maxWidth: 360 }}>
          <Input
        label="Work email"
        type="email"
        defaultValue="jane@"
        error="Enter a valid email address." />
      
        </div>

  },
  {
    name: 'Textarea',
    description: 'Multi-line variant for project details',
    render: () =>
    <div style={{ width: '100%', maxWidth: 360 }}>
          <Input
        label="How can we help?"
        type="textarea"
        rows={4}
        placeholder="Tell us about your IT needs..." />
      
        </div>

  },
  {
    name: 'Disabled',
    description: 'Non-editable field',
    render: () =>
    <div style={{ width: '100%', maxWidth: 360 }}>
          <Input label="Account ID" defaultValue="TD-100482" disabled />
        </div>

  }]

};

export default previews;