import { join } from 'node:path';
import { app } from 'electron';

export interface ServerPaths {
  serverDir: string;
  migrationsDir: string;
  mobileDir: string;
  desktopDir: string;
  /** initdb, pg_ctl y postgres del servidor embebido. */
  pgBinDir: string;
  /** pg_dump y pg_restore (con sus propias DLL) para los respaldos. */
  pgToolsDir: string;
  dataDir: string;
  pgDataDir: string;
  logsDir: string;
  configFile: string;
  trayIcon: string;
}

/**
 * Empaquetado: recursos en `process.resourcesPath` (extraResources de electron-builder).
 * Desarrollo con `--embedded`: la carpeta `staging/` que arma `npm run stage`.
 * Los datos del negocio viven en userData, fuera de la carpeta de instalación, así una
 * actualización o reinstalación nunca los borra.
 */
export function resolveServerPaths(): ServerPaths {
  const resources = app.isPackaged
    ? process.resourcesPath
    : join(import.meta.dirname, '..', 'staging');
  const userData = app.getPath('userData');
  return {
    serverDir: join(resources, 'server'),
    migrationsDir: join(resources, 'server', 'prisma', 'migrations'),
    mobileDir: join(resources, 'clients', 'mobile'),
    desktopDir: join(resources, 'clients', 'desktop'),
    pgBinDir: join(resources, 'postgres', 'bin'),
    pgToolsDir: join(resources, 'postgres-tools'),
    dataDir: join(userData, 'data'),
    pgDataDir: join(userData, 'pgdata'),
    logsDir: join(userData, 'logs'),
    configFile: join(userData, 'server.json'),
    trayIcon: app.isPackaged
      ? join(resources, 'icon.png')
      : join(import.meta.dirname, '..', 'build', 'icon.png'),
  };
}
