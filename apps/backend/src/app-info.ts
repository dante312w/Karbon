import { readFileSync } from 'node:fs';

interface PackageJson {
  version: string;
}

// La ruta relativa es la misma desde src/ (desarrollo) y dist/ (producción).
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;

export const APP_NAME = 'Karbon POS';
export const APP_VERSION = packageJson.version;
