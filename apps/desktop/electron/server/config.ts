import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';

/** Configuración propia de esta instalación: se crea una vez con secretos aleatorios. */
export interface ServerConfig {
  pgPort: number;
  httpPort: number;
  httpsPort: number;
  pgPassword: string;
  jwtSecret: string;
}

/**
 * Puertos preferidos: 3000/3443 para que la dirección de los celulares sea fácil de recordar
 * y 54329 para PostgreSQL (evita 5432/5433 de instalaciones nativas de PostgreSQL).
 */
const PREFERRED = { pgPort: 54329, httpPort: 3000, httpsPort: 3443 } as const;

function isConfig(value: unknown): value is ServerConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.pgPort === 'number' &&
    typeof config.httpPort === 'number' &&
    typeof config.httpsPort === 'number' &&
    typeof config.pgPassword === 'string' &&
    typeof config.jwtSecret === 'string'
  );
}

export function isPortFree(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, host, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

async function freePort(preferred: number, taken: ReadonlySet<number>): Promise<number> {
  for (let port = preferred; port < preferred + 50; port += 1) {
    if (!taken.has(port) && (await isPortFree(port))) return port;
  }
  throw new Error(`No hay puertos libres cerca de ${String(preferred)}`);
}

export async function loadServerConfig(file: string): Promise<ServerConfig> {
  try {
    const stored: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (isConfig(stored)) return stored;
  } catch {
    // Primer arranque: se crea abajo.
  }
  const taken = new Set<number>();
  const pgPort = await freePort(PREFERRED.pgPort, taken);
  taken.add(pgPort);
  const httpPort = await freePort(PREFERRED.httpPort, taken);
  taken.add(httpPort);
  const httpsPort = await freePort(PREFERRED.httpsPort, taken);
  const config: ServerConfig = {
    pgPort,
    httpPort,
    httpsPort,
    pgPassword: randomBytes(24).toString('base64url'),
    jwtSecret: randomBytes(48).toString('base64url'),
  };
  await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}
