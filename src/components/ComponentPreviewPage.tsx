import React from 'react';
import { useParams } from 'react-router-dom';
import { componentRegistry } from './registry';

const DS_SHELL_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

const NOT_FOUND_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  fontFamily: DS_SHELL_FONT,
  color: '#6b7280',
  fontSize: 14
};

export function ComponentPreviewPage() {
  const { name, previewIdx } = useParams<{name: string;previewIdx: string;}>();
  const decodedName = decodeURIComponent(name || '');
  const module = componentRegistry.find((m) => m.componentName === decodedName);
  const idx = Number.parseInt(previewIdx || '0', 10);

  if (!module || Number.isNaN(idx) || idx < 0 || idx >= module.previews.length) {
    return <div style={NOT_FOUND_STYLE}>Preview not found.</div>;
  }

  const preview = module.previews[idx];
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
      
      {preview.render()}
    </div>);

}