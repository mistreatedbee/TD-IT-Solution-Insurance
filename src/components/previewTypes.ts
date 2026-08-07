import React from 'react';

export type ComponentPreview = {
  name: string;
  description?: string;
  render: () => React.ReactNode;
};

export type ComponentPreviewModule = {
  componentName: string;
  description?: string;
  importPath: string;
  contextMd?: string;
  previews: ComponentPreview[];
};