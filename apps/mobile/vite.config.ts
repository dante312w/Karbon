import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Recursos de marca compartidos (logo) como carpeta pública: una sola fuente para todas las apps.
const BRAND_ASSETS_DIR = '../../packages/ui/assets';

export default defineConfig({
  // Identifica el build: la caché de datos que guardó otra versión se descarta al abrir.
  define: { __KARBON_BUILD__: JSON.stringify(Date.now().toString(36)) },
  publicDir: BRAND_ASSETS_DIR,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // El registro lo decide la app: solo en contexto seguro (ver src/pwa.ts).
      injectRegister: false,
      registerType: 'autoUpdate',
      pwaAssets: {
        image: `${BRAND_ASSETS_DIR}/logo.svg`,
        preset: 'minimal-2023',
        overrideManifestIcons: true,
      },
      manifest: {
        name: 'Karbon Meseros',
        short_name: 'Karbon',
        description: 'Terminal de pedidos para meseros de Karbon POS',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1d1237',
        background_color: '#ffffff',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        // La API y los sockets nunca se sirven desde caché: los pedidos deben ser en vivo.
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    // Accesible desde celulares en la misma red durante el desarrollo.
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
