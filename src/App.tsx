import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ComponentsPage } from './components/ComponentsPage';
import { ComponentPage } from './components/ComponentPage';
import { ComponentPreviewPage } from './components/ComponentPreviewPage';
import { componentRegistry } from './components/registry';

const firstComponentPath = componentRegistry[0] ?
`/components/${encodeURIComponent(componentRegistry[0].componentName)}` :
null;

// Deliberately NO `fontFamily` on the wrapper below: an inherited font here
// would mask components that never declare one, making them look correct in
// the showcase and wrong in consumer designs. The design system's own
// `index.css` base layer supplies typography; shell chrome sets DS_SHELL_FONT
// on its own elements.
//
// Force the document chain to fill its containing block so per-preview
// pages can use `height: 100%` reliably. This matters specifically for
// scaled iframes: the preview-host stretches `html` to N×100% to host the
// pre-scale viewport, and `100vh` would only cover the visible 1× portion
// (clipping the dotted background and breaking flex centering).
export function App() {
  return (
    <BrowserRouter>
      <style>{`html, body, #root { height: 100%; margin: 0; padding: 0; }`}</style>
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          color: '#111827',
          fontSize: 14,
          lineHeight: '20px'
        }}>
        
        <main
          style={{
            flex: 1,
            height: '100%',
            overflowY: 'auto',
            backgroundColor: '#ffffff'
          }}>
          
          <Routes>
            <Route
              path="/"
              element={
              firstComponentPath ?
              <Navigate to={firstComponentPath} replace /> :
              null
              } />
            
            <Route path="/components" element={<ComponentsPage />} />
            <Route path="/components/:name" element={<ComponentPage />} />
            <Route
              path="/components/:name/preview/:previewIdx"
              element={<ComponentPreviewPage />} />
            
          </Routes>
        </main>
      </div>
    </BrowserRouter>);

}