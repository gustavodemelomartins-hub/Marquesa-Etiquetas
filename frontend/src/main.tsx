import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('Faltou <div id="root"> no index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
