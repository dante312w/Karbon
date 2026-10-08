/**
 * Arma `apps/desktop/staging/`, los recursos que electron-builder copia junto al ejecutable:
 *
 *   server/          backend compilado + dependencias de producción + migraciones
 *   clients/         PWA de meseros y renderer (KDS web) que sirve el backend en la LAN
 *   postgres/        PostgreSQL embebido (initdb, pg_ctl, postgres)
 *   postgres-tools/  pg_dump y pg_restore con sus propias DLL (respaldos)
 *
 * Requiere haber compilado antes (`npm run build` en la raíz). Uso: `npm run stage`.
 * PG_TOOLS_DIR permite indicar dónde están pg_dump/pg_restore (por defecto, PostgreSQL 18
 * instalado en Windows).
 */
import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

const desktopDir = resolve(import.meta.dirname, '..');
const repoDir = resolve(desktopDir, '..', '..');
const staging = join(desktopDir, 'staging');
const isWindows = process.platform === 'win32';
const exe = (name: string): string => `${name}${isWindows ? '.exe' : ''}`;

function step(message: string): void {
  console.log(`• ${message}`);
}

function requireDir(path: string, hint: string): void {
  if (!existsSync(path)) throw new Error(`No existe ${path}. ${hint}`);
}

interface PackageJson {
  version: string;
  dependencies?: Record<string, string>;
}

function readPackage(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
}

// ─── Servidor ────────────────────────────────────────────────────────────────

function stageServer(): void {
  const backendDir = join(repoDir, 'apps', 'backend');
  requireDir(join(backendDir, 'dist'), 'Compila primero: npm run build');
  const target = join(staging, 'server');
  step('Servidor: código compilado y migraciones');
  cpSync(join(backendDir, 'dist'), join(target, 'dist'), { recursive: true });
  cpSync(join(backendDir, 'prisma', 'migrations'), join(target, 'prisma', 'migrations'), {
    recursive: true,
  });

  const backend = readPackage(join(backendDir, 'package.json'));
  // Sin paquetes del monorepo (se copian abajo) ni la CLI de Prisma (el backend migra solo).
  const dependencies = Object.fromEntries(
    Object.entries(backend.dependencies ?? {}).filter(
      ([name]) => !name.startsWith('@karbon/') && name !== 'prisma',
    ),
  );
  writeFileSync(
    join(target, 'package.json'),
    JSON.stringify(
      {
        name: 'karbon-server',
        version: backend.version,
        private: true,
        type: 'module',
        dependencies,
      },
      null,
      2,
    ),
  );
  step('Servidor: dependencias de producción (npm install --omit=dev)');
  execSync(
    'npm install --omit=dev --ignore-scripts --no-audit --no-fund --workspaces=false --package-lock=false',
    {
      cwd: target,
      stdio: 'inherit',
    },
  );

  for (const shared of ['types', 'utils']) {
    const source = join(repoDir, 'packages', shared);
    requireDir(join(source, 'dist'), 'Compila primero: npm run build');
    const destination = join(target, 'node_modules', '@karbon', shared);
    cpSync(join(source, 'dist'), join(destination, 'dist'), { recursive: true });
    cpSync(join(source, 'package.json'), join(destination, 'package.json'));
  }
}

// ─── Clientes web ────────────────────────────────────────────────────────────

function stageClients(): void {
  step('Clientes: PWA de meseros y KDS web');
  const mobile = join(repoDir, 'apps', 'mobile', 'dist');
  const renderer = join(desktopDir, 'dist');
  requireDir(mobile, 'Compila primero: npm run build');
  requireDir(renderer, 'Compila primero: npm run build');
  cpSync(mobile, join(staging, 'clients', 'mobile'), { recursive: true });
  cpSync(renderer, join(staging, 'clients', 'desktop'), { recursive: true });
}

// ─── PostgreSQL ──────────────────────────────────────────────────────────────

/** DLL que importa un ejecutable de Windows (tabla de importaciones del formato PE). */
function peImports(file: string): string[] {
  const buffer = readFileSync(file);
  const peOffset = buffer.readUInt32LE(0x3c);
  if (buffer.toString('latin1', peOffset, peOffset + 4) !== 'PE\0\0') return [];
  const coff = peOffset + 4;
  const sectionCount = buffer.readUInt16LE(coff + 2);
  const optionalSize = buffer.readUInt16LE(coff + 16);
  const optional = coff + 20;
  const pe32Plus = buffer.readUInt16LE(optional) === 0x20b;
  const importRva = buffer.readUInt32LE(optional + (pe32Plus ? 112 : 96) + 8);
  const sections = optional + optionalSize;
  const toOffset = (rva: number): number | null => {
    for (let index = 0; index < sectionCount; index += 1) {
      const header = sections + index * 40;
      const virtualAddress = buffer.readUInt32LE(header + 12);
      const size = Math.max(buffer.readUInt32LE(header + 8), buffer.readUInt32LE(header + 16));
      if (rva >= virtualAddress && rva < virtualAddress + size) {
        return rva - virtualAddress + buffer.readUInt32LE(header + 20);
      }
    }
    return null;
  };
  const names: string[] = [];
  let descriptor = importRva ? toOffset(importRva) : null;
  while (descriptor !== null) {
    const nameRva = buffer.readUInt32LE(descriptor + 12);
    if (nameRva === 0) break;
    const nameOffset = toOffset(nameRva);
    if (nameOffset === null) break;
    names.push(buffer.toString('latin1', nameOffset, buffer.indexOf(0, nameOffset)));
    descriptor += 20;
  }
  return names;
}

const VC_RUNTIME = /^(vcruntime|msvcp)\d/i;
const SYSTEM32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');

/**
 * Copia ejecutables y la clausura de DLL que importan desde `sourceDir`. El runtime de
 * Visual C++ se incluye junto a los binarios (despliegue local permitido por Microsoft): un
 * equipo sin el redistribuible instalado igual puede arrancar PostgreSQL.
 */
function copyWithDependencies(sourceDir: string, executables: string[], targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  const available = new Map(readdirSync(sourceDir).map((file) => [file.toLowerCase(), file]));
  const pending = executables.map((file) => join(sourceDir, file));
  const copied = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || copied.has(file.toLowerCase())) continue;
    copied.add(file.toLowerCase());
    cpSync(file, join(targetDir, basename(file)));
    for (const dependency of peImports(file)) {
      const local = available.get(dependency.toLowerCase());
      if (local) pending.push(join(sourceDir, local));
      else if (VC_RUNTIME.test(dependency) && existsSync(join(SYSTEM32, dependency))) {
        pending.push(join(SYSTEM32, dependency));
      }
    }
  }
}

function stagePostgres(): void {
  const platformPackage = {
    win32: 'windows-x64',
    linux: 'linux-x64',
    darwin: process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64',
  }[process.platform as 'win32' | 'linux' | 'darwin'];
  const source = join(repoDir, 'node_modules', '@embedded-postgres', platformPackage, 'native');
  requireDir(source, 'Instala las dependencias opcionales: npm install');
  step(`PostgreSQL embebido (${platformPackage})`);
  const target = join(staging, 'postgres');
  cpSync(source, target, { recursive: true });
  if (isWindows) {
    // Agrega el runtime de Visual C++ que necesitan los binarios del servidor.
    copyWithDependencies(
      join(source, 'bin'),
      [exe('postgres'), exe('initdb'), exe('pg_ctl')],
      join(target, 'bin'),
    );
  }
}

function stagePostgresTools(): void {
  const toolsDir =
    process.env.PG_TOOLS_DIR ??
    (isWindows ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '/usr/lib/postgresql/18/bin');
  if (!existsSync(join(toolsDir, exe('pg_dump')))) {
    // Un instalador publicado sin respaldos no es aceptable; en local basta la advertencia.
    if (process.env.CI)
      throw new Error(`No se encontró pg_dump en ${toolsDir}. Define PG_TOOLS_DIR.`);
    console.warn(
      `⚠ No se encontró pg_dump en ${toolsDir}: el instalador no podrá hacer respaldos. Define PG_TOOLS_DIR.`,
    );
    return;
  }
  step(`Herramientas de respaldo desde ${toolsDir}`);
  const target = join(staging, 'postgres-tools');
  if (isWindows) copyWithDependencies(toolsDir, [exe('pg_dump'), exe('pg_restore')], target);
  else {
    mkdirSync(target, { recursive: true });
    for (const tool of ['pg_dump', 'pg_restore']) cpSync(join(toolsDir, tool), join(target, tool));
  }
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
stageServer();
stageClients();
stagePostgres();
stagePostgresTools();
step(`Listo: ${staging}`);
