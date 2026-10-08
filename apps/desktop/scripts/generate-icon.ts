/**
 * Genera el ícono del instalador (build/icon.png) desde el logo compartido de la marca.
 * Uso: `npm run icon --workspace=@karbon/desktop` (el PNG resultante se versiona).
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ICON_SIZE = 1024;
const source = fileURLToPath(new URL('../../../packages/ui/assets/logo.svg', import.meta.url));
const buildDir = fileURLToPath(new URL('../build/', import.meta.url));

mkdirSync(buildDir, { recursive: true });
await sharp(source, { density: 384 })
  .resize(ICON_SIZE, ICON_SIZE)
  .png()
  .toFile(`${buildDir}icon.png`);

console.info(`Ícono generado: ${buildDir}icon.png (${ICON_SIZE}×${ICON_SIZE})`);
