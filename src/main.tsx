import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

async function boot() {
  // Make sure the brand fonts are ready before any text is sampled into particles.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('900 100px Montserrat'),
        document.fonts.load('700 100px Cinzel'),
        document.fonts.load('400 20px Cinzel'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void boot();
