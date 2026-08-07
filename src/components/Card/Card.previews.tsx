import { ShieldCheckIcon, ServerIcon, ArrowRightIcon } from 'lucide-react';
import { Card, CardHeader, CardBody, CardFooter } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'Card',
  importPath: 'components/Card',
  previews: [
  {
    name: 'Default',
    description: 'Base surface with header and body content.',
    render: () =>
    <Card className="max-w-sm">
          <CardHeader
        title="Managed IT Support"
        description="Round-the-clock monitoring for your infrastructure." />
      
          <CardBody>
            Proactive maintenance, patching, and helpdesk coverage so your team stays productive.
          </CardBody>
        </Card>

  },
  {
    name: 'Service card',
    description: 'Icon, body, and footer action — hover to see the lift and blue accent edge.',
    render: () =>
    <Card as="article" className="max-w-sm">
          <CardHeader
        icon={<ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />}
        title="Cybersecurity"
        description="Endpoint protection and threat response." />
      
          <CardBody>
            Continuous vulnerability scanning with incident response backed by a 15-minute SLA.
          </CardBody>
          <CardFooter>
            <a
          href="#"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
          
              Learn more
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </a>
          </CardFooter>
        </Card>

  },
  {
    name: 'Static & compact',
    description: 'Non-interactive card with small padding, for dense content blocks.',
    render: () =>
    <Card interactive={false} padding="sm" className="max-w-xs">
          <CardHeader
        icon={<ServerIcon className="h-5 w-5" aria-hidden="true" />}
        title="99.98% uptime"
        description="Across all managed environments this quarter." />
      
        </Card>

  }]

};

export default previews;