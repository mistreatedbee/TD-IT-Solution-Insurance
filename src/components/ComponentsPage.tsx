import React from 'react';
import { ComponentSection } from './ComponentSection';
import { componentRegistry } from './registry';

export function ComponentsPage() {
  return (
    <div
      style={{
        padding: '48px 40px',
        marginLeft: 'auto',
        marginRight: 'auto',
        maxWidth: 'var(--canvas-max-width)'
      }}>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        {componentRegistry.map((module) =>
        <ComponentSection key={module.componentName} module={module} />
        )}
      </div>
    </div>);

}