import { LogoCloud } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'LogoCloud',
  importPath: 'components/LogoCloud',
  previews: [
  {
    name: 'Default',
    description: 'Placeholder partner logos scrolling left with faded edges.',
    render: () => <LogoCloud title="Trusted by teams worldwide" />
  },
  {
    name: 'Reverse & fast',
    description: 'Right-scrolling marquee at a faster speed, no title.',
    render: () => <LogoCloud direction="right" speed={110} />
  },
  {
    name: 'Hard edges, custom logos',
    description:
    'Custom logo list with edge fading disabled and hover pause turned off.',
    render: () =>
    <LogoCloud
      title="Our clients"
      fadeEdges={false}
      pauseOnHover={false}
      speed={40}
      logos={[
      { name: 'Lumen' },
      { name: 'Beacon' },
      { name: 'Orbit Labs' },
      { name: 'Fieldwork' },
      { name: 'Pinecrest' }]
      } />


  }]

};

export default previews;