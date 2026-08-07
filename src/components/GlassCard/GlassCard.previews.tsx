import { ShieldCheckIcon, ZapIcon, TrendingUpIcon } from 'lucide-react';
import { GlassCard } from './index';
import type { ComponentPreviewModule } from '../previewTypes';

const DarkBackdrop = ({ children }: {children: React.ReactNode;}) =>
<div className="flex w-full items-center justify-center bg-slate-900 p-8">{children}</div>;


const LightBackdrop = ({ children }: {children: React.ReactNode;}) =>
<div className="flex w-full items-center justify-center bg-slate-100 p-8">{children}</div>;


const previews: ComponentPreviewModule = {
  componentName: 'GlassCard',
  importPath: 'components/GlassCard',
  previews: [
  {
    name: 'Default',
    description: 'Benefit card with icon, title, and description on a dark background.',
    render: () =>
    <DarkBackdrop>
          <GlassCard
        className="max-w-sm"
        icon={<ShieldCheckIcon className="h-5 w-5" />}
        title="Enterprise-grade security"
        description="24/7 monitoring, managed endpoint protection, and compliance-ready reporting." />
      
        </DarkBackdrop>

  },
  {
    name: 'Interactive',
    description: 'Hover-lift variant for clickable benefit tiles.',
    render: () =>
    <DarkBackdrop>
          <GlassCard
        interactive
        tabIndex={0}
        role="button"
        className="max-w-sm"
        icon={<ZapIcon className="h-5 w-5" />}
        title="Faster response times"
        description="Average first response under 12 minutes across all support tiers." />
      
        </DarkBackdrop>

  },
  {
    name: 'Dark tone, small flair',
    description: 'Compact floating stat card tinted for light backgrounds.',
    render: () =>
    <LightBackdrop>
          <GlassCard tone="dark" padding="sm" className="max-w-[220px]">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/5 ring-1 ring-slate-900/10">
                <TrendingUpIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-lg font-semibold leading-none">99.98%</p>
                <p className="mt-1 text-xs text-slate-600">Uptime this year</p>
              </div>
            </div>
          </GlassCard>
        </LightBackdrop>

  }]

};

export default previews;