import { Accordion, AccordionItem } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'Accordion',
  importPath: 'components/Accordion',
  previews: [
  {
    name: 'Default',
    description: 'Single-open FAQ list with the first item expanded.',
    render: () =>
    <div className="w-full max-w-xl">
          <Accordion defaultOpen={['support']}>
            <AccordionItem value="support" title="What support hours do you offer?">
              Our service desk is staffed 7am–7pm on business days, with 24/7 on-call coverage for
              priority incidents.
            </AccordionItem>
            <AccordionItem value="onboarding" title="How long does onboarding take?">
              Most environments are fully onboarded within two weeks, including asset discovery and
              endpoint enrollment.
            </AccordionItem>
            <AccordionItem value="contracts" title="Are contracts month to month?">
              Yes. Managed service plans run month to month after an initial 90-day engagement.
            </AccordionItem>
          </Accordion>
        </div>

  },
  {
    name: 'Allow multiple',
    description: 'Several items can stay open at once.',
    render: () =>
    <div className="w-full max-w-xl">
          <Accordion allowMultiple defaultOpen={['a', 'b']}>
            <AccordionItem value="a" title="Do you handle compliance reporting?">
              We produce quarterly evidence packs for SOC 2, HIPAA, and PCI DSS audits.
            </AccordionItem>
            <AccordionItem value="b" title="Can you work alongside our internal IT team?">
              Absolutely — co-managed engagements are our most common model.
            </AccordionItem>
            <AccordionItem value="c" title="What is included in monitoring?">
              Endpoint health, network uptime, backup verification, and security alerting.
            </AccordionItem>
          </Accordion>
        </div>

  },
  {
    name: 'With disabled item',
    description: 'An item that cannot be expanded.',
    render: () =>
    <div className="w-full max-w-xl">
          <Accordion>
            <AccordionItem value="pricing" title="How is pricing calculated?">
              Pricing is per supported user, with volume tiers starting at 25 seats.
            </AccordionItem>
            <AccordionItem value="soon" title="Hardware procurement (coming soon)" disabled>
              This section is not available yet.
            </AccordionItem>
          </Accordion>
        </div>

  }]

};

export default previews;