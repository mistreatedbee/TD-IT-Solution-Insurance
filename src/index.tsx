import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

export * from './components';

const rootEl = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootEl) {
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);

  ReactDOM.createRoot(rootEl).render(<App />);
}