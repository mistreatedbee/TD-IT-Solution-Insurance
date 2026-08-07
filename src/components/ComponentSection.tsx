import React from 'react';
import type { ComponentPreviewModule } from './previewTypes';

const DS_SHELL_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

type Props = {
  module: ComponentPreviewModule;
  title?: string;
};

export function ComponentSection({ module, title }: Props) {
  return (
    <section id={module.componentName}>
      <div style={{ marginBottom: 24, fontFamily: DS_SHELL_FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h2
            style={{
              fontSize: 24,
              lineHeight: '32px',
              fontWeight: 700,
              color: '#111827',
              margin: 0,
              fontFamily: DS_SHELL_FONT
            }}>
            
            {title ?? module.componentName}
          </h2>
        </div>
        {!title && module.description &&
        <p
          style={{
            fontSize: 14,
            lineHeight: '20px',
            color: '#6b7280',
            marginTop: 0,
            marginBottom: 12,
            fontFamily: DS_SHELL_FONT
          }}>
          
            {module.description}
          </p>
        }
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {module.previews.map((preview, idx) =>
        <div
          key={preview.name || idx}
          style={{
            borderRadius: 12,
            border: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            overflow: 'hidden'
          }}>
          
            <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid #e5e7eb',
              fontFamily: DS_SHELL_FONT
            }}>
            
              <span
              style={{
                fontSize: 14,
                lineHeight: '20px',
                fontWeight: 600,
                color: '#111827',
                fontFamily: DS_SHELL_FONT
              }}>
              
                {preview.name}
              </span>
              {preview.description &&
            <p
              style={{
                fontSize: 12,
                lineHeight: '16px',
                color: '#6b7280',
                marginTop: 2,
                marginBottom: 0,
                fontFamily: DS_SHELL_FONT
              }}>
              
                  {preview.description}
                </p>
            }
            </div>
            <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200
            }}>
            
              {preview.render()}
            </div>
          </div>
        )}
      </div>
    </section>);

}