import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * CSP del renderer. Se inyecta solo en el build: en desarrollo Vite necesita scripts inline
 * para el recargado en caliente. connect-src admite el backend local (Electron) y el propio
 * origen (renderer servido por el backend en la LAN).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http://localhost:* http://127.0.0.1:*",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'karbon:content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  // Identifica el build: la caché de datos que guardó otra versión se descarta al abrir.
  define: { __KARBON_BUILD__: JSON.stringify(Date.now().toString(36)) },
  // Rutas relativas: el mismo build lo sirven Electron (app://karbon) y el backend bajo /app/.
  base: './',
  // Recursos de marca compartidos con la PWA (logo, favicon).
  publicDir: '../../packages/ui/assets',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  server: {
    port: 5173,
    strictPort: true,
    // Accesible desde la red: el tablero de cocina/barra se prueba en una tablet real.
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
