import {
  combinePresetAndAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

/** Color de marca: fondo de las pantallas de inicio de iOS (igual en tema claro y oscuro). */
const BRAND = '#1d1237';

/**
 * Íconos de la PWA y pantallas de inicio (splash) de iOS: sin ellas, la app instalada abre en
 * blanco mientras carga. Se generan para los tamaños de pantalla más comunes de iPhone y iPad;
 * los modelos con el mismo tamaño comparten imagen.
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: combinePresetAndAppleSplashScreens(
    minimal2023Preset,
    {
      padding: 0.4,
      resizeOptions: { background: BRAND, fit: 'contain' },
      linkMediaOptions: { log: false, addMediaScreen: true, basePath: '/', xhtml: false },
      png: { compressionLevel: 9, quality: 60 },
    },
    [
      'iPhone SE 4"',
      'iPhone 8',
      'iPhone 8 Plus',
      'iPhone 13 mini',
      'iPhone 14',
      'iPhone 14 Plus',
      'iPhone 16 Pro',
      'iPhone 16 Pro Max',
      'iPad 10.2"',
      'iPad Air 10.9"',
      'iPad Pro 11"',
      'iPad Pro 12.9"',
    ],
  ),
  images: ['../../packages/ui/assets/logo.svg'],
});
