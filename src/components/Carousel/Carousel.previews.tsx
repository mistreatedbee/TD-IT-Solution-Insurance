import { Carousel, CarouselItem } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const testimonials = [
{ quote: 'Their team migrated our infrastructure with zero downtime.', name: 'Dana Whitfield', role: 'CTO, Northwind Logistics' },
{ quote: 'Support response times dropped from days to under an hour.', name: 'Marcus Reed', role: 'IT Director, Bellview Health' },
{ quote: 'A genuine partner, not just another managed service vendor.', name: 'Priya Nandan', role: 'COO, Arcadia Manufacturing' }];


const industries = ['Healthcare', 'Finance', 'Manufacturing', 'Legal', 'Education', 'Retail'];

const logos = ['Northwind', 'Bellview', 'Arcadia', 'Vertex', 'Lumen', 'Kestrel'];

const previews: ComponentPreviewModule = {
  componentName: 'Carousel',
  importPath: 'components/Carousel',
  previews: [
  {
    name: 'Testimonials',
    description: 'One full-width slide at a time with arrows and dot pagination.',
    render: () =>
    <div className="w-full max-w-xl">
          <Carousel label="Client testimonials">
            {testimonials.map((item) =>
        <CarouselItem key={item.name}>
                <figure className="h-full rounded-lg border border-slate-200 bg-white p-6">
                  <blockquote className="text-base text-slate-700">“{item.quote}”</blockquote>
                  <figcaption className="mt-4 text-sm">
                    <span className="font-semibold text-slate-900">{item.name}</span>
                    <span className="block text-slate-500">{item.role}</span>
                  </figcaption>
                </figure>
              </CarouselItem>
        )}
          </Carousel>
        </div>

  },
  {
    name: 'Multi-item industries',
    description: 'Responsive basis classes show multiple cards per view.',
    render: () =>
    <div className="w-full max-w-xl">
          <Carousel label="Industries we serve">
            {industries.map((industry) =>
        <CarouselItem key={industry} className="basis-1/2 sm:basis-1/3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm font-medium text-slate-800">
                  {industry}
                </div>
              </CarouselItem>
        )}
          </Carousel>
        </div>

  },
  {
    name: 'Free-drag logo strip',
    description: 'Drag-free looping scroll with controls hidden — ideal for logo sets.',
    render: () =>
    <div className="w-full max-w-xl">
          <Carousel
        label="Client logos"
        showArrows={false}
        showDots={false}
        options={{ dragFree: true, loop: true }}>
        
            {logos.map((logo) =>
        <CarouselItem key={logo} className="basis-1/3 sm:basis-1/4">
                <div className="flex h-16 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {logo}
                </div>
              </CarouselItem>
        )}
          </Carousel>
        </div>

  }]

};

export default previews;