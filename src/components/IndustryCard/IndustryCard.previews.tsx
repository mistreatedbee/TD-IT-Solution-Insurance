import { HeartPulseIcon, LandmarkIcon, FactoryIcon } from 'lucide-react';
import { IndustryCard } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'IndustryCard',
  importPath: 'components/IndustryCard',
  previews: [
  {
    name: 'Default',
    description: 'Standard industry card with accent bar and icon',
    render: () =>
    <div className="max-w-sm">
          <IndustryCard
        title="Healthcare"
        description="HIPAA-compliant IT support, secure networks, and 24/7 monitoring for clinics and practices."
        icon={HeartPulseIcon}
        accent="blue" />
      
        </div>

  },
  {
    name: 'Accent colors',
    description: 'Different accent colors for distinct verticals',
    render: () =>
    <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <IndustryCard
        title="Finance"
        description="Regulatory-ready infrastructure and data protection for financial services teams."
        icon={LandmarkIcon}
        accent="green" />
      
          <IndustryCard
        title="Manufacturing"
        description="Shop-floor connectivity, OT security, and resilient systems that keep lines running."
        icon={FactoryIcon}
        accent="amber" />
      
          <IndustryCard
        title="Public sector"
        description="Compliant, audited environments for agencies and municipal organizations."
        icon={LandmarkIcon}
        accent="purple" />
      
        </div>

  },
  {
    name: 'Interactive',
    description: 'Clickable card with hover and focus states',
    render: () =>
    <div className="max-w-sm">
          <IndustryCard
        title="Legal"
        description="Document security, e-discovery readiness, and reliable remote access for firms."
        icon={LandmarkIcon}
        accent="slate"
        onClick={() => window.alert('Industry selected')} />
      
        </div>

  }]

};

export default previews;