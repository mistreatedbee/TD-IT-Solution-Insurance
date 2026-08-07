import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// react-refresh/only-export-components: intentionally left as a warning.
// This barrel re-export of the whole component library is the app's
// public entry point (consumed the same way the `components/*` barrel
// is used internally); ESLint can't statically verify every re-exported
// symbol is a component, but that's expected for a library entry file.
export * from './components';

const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootEl) {
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);

  ReactDOM.createRoot(rootEl).render(<App />);
}