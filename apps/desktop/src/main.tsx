import { KarbonProvider } from '@karbon/client';
import { ThemeProvider, Toaster, unlockAudioOnGesture } from '@karbon/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './index.css';
import { resolveRuntime } from './lib/runtime';
import { RuntimeContext } from './lib/runtime-context';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el contenedor #root');

const runtime = await resolveRuntime();
// El KDS también se abre en iPad: el audio queda habilitado con el primer toque.
unlockAudioOnGesture();

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <RuntimeContext value={runtime}>
        <KarbonProvider
          baseUrl={runtime.apiBaseUrl}
          storageKey={runtime.desktop ? 'karbon.desktop.session' : 'karbon.web.session'}
          cacheVersion={__KARBON_BUILD__}
        >
          <App />
          <Toaster />
        </KarbonProvider>
      </RuntimeContext>
    </ThemeProvider>
  </StrictMode>,
);
