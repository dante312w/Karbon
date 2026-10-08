import { describe, expect, it } from 'vitest';
import { backupFileName, parseBackupFileName, pgEnvironment } from './backup-files.js';

describe('nombres de respaldo', () => {
  it('ida y vuelta: el nombre conserva motivo y fecha', () => {
    const date = new Date('2026-09-26T03:15:00Z');
    const name = backupFileName('CASH_CLOSE', date);
    expect(name).toBe('karbon-20260926-031500-cierre-caja.dump');
    expect(parseBackupFileName(name)).toEqual({ reason: 'CASH_CLOSE', createdAt: date });
  });

  it('rechaza nombres ajenos o con rutas', () => {
    expect(parseBackupFileName('../../etc/passwd')).toBeNull();
    expect(parseBackupFileName('karbon-20260926-031500-otro.dump')).toBeNull();
    expect(parseBackupFileName('karbon-20260926-031500-manual.dump.exe')).toBeNull();
  });
});

describe('pgEnvironment', () => {
  it('separa credenciales y descarta parámetros de Prisma', () => {
    expect(
      pgEnvironment('postgresql://karbon:p%40ss@localhost:55432/karbon?schema=public'),
    ).toEqual({
      PGHOST: 'localhost',
      PGPORT: '55432',
      PGUSER: 'karbon',
      PGPASSWORD: 'p@ss',
      PGDATABASE: 'karbon',
    });
  });
});
