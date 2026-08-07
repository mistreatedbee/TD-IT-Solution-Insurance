import { TestimonialCard } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'TestimonialCard',
  importPath: 'components/TestimonialCard',
  previews: [
  {
    name: 'Default',
    description: 'Full card with client logo, avatar, and author details.',
    render: () =>
    <TestimonialCard
      logoUrl="https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo_TV_2015.png"
      logoAlt="Northwind Freight logo"
      quote="Their team migrated our entire infrastructure over a single weekend with zero downtime. Support has been just as responsive ever since."
      authorName="Amara Osei"
      authorTitle="Director of IT"
      company="Northwind Freight"
      avatarUrl="https://i.pravatar.cc/96?img=47" />


  },
  {
    name: 'Avatar placeholder',
    description: 'No avatar image — falls back to author initials.',
    render: () =>
    <TestimonialCard
      quote="We finally have a help desk that closes tickets faster than we can open them."
      authorName="Daniel Reyes"
      authorTitle="Operations Manager"
      company="Bluepeak Health" />


  },
  {
    name: 'Quote only',
    description: 'Minimal variant with just the quote and a name.',
    render: () =>
    <TestimonialCard
      quote="Reliable, calm, and genuinely easy to work with."
      authorName="Priya Nair" />


  }]

};

export default previews;