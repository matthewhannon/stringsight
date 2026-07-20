import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AudioInputPrototypePage } from './AudioInputPrototypePage';
import '../styles/global.css';
import './audioInputPrototype.css';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (rootElement === null) {
  throw new Error('StringSight could not find the audio-input prototype root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AudioInputPrototypePage />
  </StrictMode>,
);
