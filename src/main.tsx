import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './styles/global.css';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (rootElement === null) {
  throw new Error('StringSight could not find its root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
