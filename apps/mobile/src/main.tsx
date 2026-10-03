import { KarbonProvider } from '@karbon/client';
import { ThemeProvider, Toaster, unlockAudioOnGesture } from '@karbon/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './index.css';
import { PwaModeContext } from './lib/pwa-mode';
import { registerServiceWorker } from './pwa';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el contenedor #root');

const pwaMode = registerServiceWorker();
// iOS solo deja sonar avisos después de un toque: el primero (y cada vuelta a la app) lo habilita.
unlockAudioOnGesture();

// La PWA la sirve el mismo servidor del restaurante: la API es del mismo origen.
createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <PwaModeContext value={pwaMode}>
        <KarbonProvider
          baseUrl=""
          storageKey="karbon.mobile.session"
          cacheVersion={__KARBON_BUILD__}
        >
          <App />
          <Toaster />
        </KarbonProvider>
      </PwaModeContext>
    </ThemeProvider>
  </StrictMode>,
);
