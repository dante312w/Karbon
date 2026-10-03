import { defineConfig, type UserConfig } from 'tsdown';

const shared: UserConfig = {
  outDir: 'dist-electron',
  platform: 'node',
  target: 'node24',
  deps: { neverBundle: ['electron'] },
  dts: false,
  clean: false,
};

/**
 * El proceso principal es ESM; el preload debe ser CommonJS porque corre en un renderer
 * con `sandbox: true`, donde no se admiten preloads ESM.
 */
export default defineConfig([
  { ...shared, entry: { main: 'electron/main.ts' }, format: 'esm' },
  { ...shared, entry: { preload: 'electron/preload.ts' }, format: 'cjs' },
]);
