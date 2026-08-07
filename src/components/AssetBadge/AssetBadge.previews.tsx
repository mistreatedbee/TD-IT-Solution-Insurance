import { AssetBadge } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const previews: ComponentPreviewModule = {
  componentName: 'AssetBadge',
  importPath: 'components/AssetBadge',
  previews: [
  {
    name: 'Default',
    description: 'Single covered asset type',
    render: () =>
    <div className="w-40">
          <AssetBadge type="laptop" />
        </div>

  },
  {
    name: 'Coverage grid',
    description: 'All asset types in the coverage overview grid',
    render: () =>
    <div className="grid w-full max-w-xl grid-cols-3 gap-3">
          <AssetBadge type="vehicle" description="2 covered" selected />
          <AssetBadge type="laptop" description="1 covered" selected />
          <AssetBadge type="phone" description="3 covered" selected />
          <AssetBadge type="tablet" description="Not covered" />
          <AssetBadge type="tv" description="Not covered" />
          <AssetBadge type="business" description="Add plan" disabled />
        </div>

  },
  {
    name: 'Selectable',
    description: 'Interactive and small size variants',
    render: () =>
    <div className="grid w-full max-w-sm grid-cols-3 gap-2">
          <AssetBadge type="phone" size="sm" onClick={() => {/* preview only: no action needed, presence of onClick makes the badge interactive/focusable */}} selected />
          <AssetBadge type="tablet" size="sm" onClick={() => {/* preview only: no action needed, presence of onClick makes the badge interactive/focusable */}} />
          <AssetBadge type="tv" size="sm" onClick={() => {/* preview only: no action needed, presence of onClick makes the badge interactive/focusable */}} disabled />
        </div>

  }]

};

export default previews;