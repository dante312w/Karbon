import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/database/migrator.js';
import { recreateDatabase, testDatabaseUrl } from './integration/database.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const DATABASE_URL = testDatabaseUrl('karbon_reversible_test');

/** Migraciones con reversión (down.sql), de la más nueva a la más vieja. */
const REVERSIBLE = [
  '20261003121000_staff_call_recipient_seen_escalation',
  '20261003120000_note_options_many_to_many',
] as const;

/**
 * Las migraciones de notas por categoría y de llamados a un mesero: convierten los datos de una
 * instalación existente sin perder nada y se pueden revertir con su down.sql.
 */
describe('migraciones reversibles', () => {
  let client: pg.Client;
  let previousDir: string;

  const rows = async <T extends pg.QueryResultRow>(sql: string): Promise<T[]> =>
    (await client.query<T>(sql)).rows;
  const columns = async (table: string): Promise<string[]> =>
    (
      await rows<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`,
      )
    ).map((row) => row.column_name);
  const down = async (name: string): Promise<void> => {
    await client.query('BEGIN');
    await client.query(await readFile(join(MIGRATIONS_DIR, name, 'down.sql'), 'utf8'));
    await client.query('COMMIT');
  };

  beforeAll(async () => {
    // Una instalación como la de hoy: todas las migraciones menos las nuevas.
    previousDir = await mkdtemp(join(tmpdir(), 'karbon-migrations-'));
    const names = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !REVERSIBLE.includes(entry.name as never))
      .map((entry) => entry.name);
    for (const name of names) {
      await cp(join(MIGRATIONS_DIR, name), join(previousDir, name), { recursive: true });
    }
    await recreateDatabase(DATABASE_URL);
    await migrate(DATABASE_URL, previousDir);
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    // Notas del modelo anterior: la misma nota repetida por categoría (una apagada), una general
    // que también estaba en una categoría y una nota propia de otra categoría.
    await client.query(`
      INSERT INTO categories (id, name, updated_at) VALUES
        ('00000000-0000-7000-8000-00000000000a', 'Bebidas', now()),
        ('00000000-0000-7000-8000-00000000000b', 'Cócteles', now());
      INSERT INTO category_note_options (id, category_id, label, sort_order, is_active, created_at, updated_at) VALUES
        (uuidv7(), '00000000-0000-7000-8000-00000000000a', 'Sin hielo', 0, true, now() - interval '3 minutes', now()),
        (uuidv7(), '00000000-0000-7000-8000-00000000000b', 'sin hielo', 4, false, now() - interval '2 minutes', now()),
        (uuidv7(), NULL, 'Para llevar', 0, true, now() - interval '1 minute', now()),
        (uuidv7(), '00000000-0000-7000-8000-00000000000a', 'Para llevar', 1, true, now(), now()),
        (uuidv7(), '00000000-0000-7000-8000-00000000000b', 'Sin cebolla', 0, true, now(), now());
    `);
  });

  afterAll(async () => {
    await client.end();
    await rm(previousDir, { recursive: true, force: true });
  });

  it('notas: cada texto queda una vez, con todas sus categorías; las generales siguen generales', async () => {
    const result = await migrate(DATABASE_URL, MIGRATIONS_DIR);
    expect(result.applied).toEqual([...REVERSIBLE].reverse());

    const notes = await rows<{
      label: string;
      is_general: boolean;
      is_active: boolean;
      categories: string[] | null;
    }>(`
      SELECT n.label, n.is_general, n.is_active,
             array_agg(c.name ORDER BY c.name) FILTER (WHERE c.name IS NOT NULL) AS categories
      FROM note_options n
      LEFT JOIN note_option_categories l ON l.note_option_id = n.id
      LEFT JOIN categories c ON c.id = l.category_id
      GROUP BY n.id ORDER BY n.label`);
    expect(notes).toEqual([
      { label: 'Para llevar', is_general: true, is_active: true, categories: null },
      { label: 'Sin cebolla', is_general: false, is_active: true, categories: ['Cócteles'] },
      {
        label: 'Sin hielo',
        is_general: false,
        is_active: true,
        categories: ['Bebidas', 'Cócteles'],
      },
    ]);
    await expect(
      client.query(
        `INSERT INTO note_options (id, label, updated_at) VALUES (uuidv7(), 'SIN HIELO', now())`,
      ),
    ).rejects.toThrow();
  });

  it('llamados: columnas de "vista", escalamiento y su configuración (apagada)', async () => {
    expect(await columns('staff_calls')).toEqual(
      expect.arrayContaining(['seen_at', 'seen_by_id', 'escalated_at']),
    );
    const [settings] = await rows<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'restaurant_settings' AND column_name = 'staff_call_escalate_seconds'`,
    );
    expect(settings?.column_default).toBe('0');
  });

  it('down.sql deja el esquema y los datos como antes, y se puede volver a migrar', async () => {
    for (const name of REVERSIBLE) await down(name);

    expect(await columns('staff_calls')).not.toContain('seen_at');
    expect(await columns('restaurant_settings')).not.toContain('staff_call_escalate_seconds');
    const notes = await rows<{ label: string; category: string | null }>(`
      SELECT o.label, c.name AS category
      FROM category_note_options o LEFT JOIN categories c ON c.id = o.category_id
      ORDER BY o.label, c.name NULLS FIRST`);
    expect(notes).toEqual([
      { label: 'Para llevar', category: null },
      { label: 'Sin cebolla', category: 'Cócteles' },
      { label: 'Sin hielo', category: 'Bebidas' },
      { label: 'Sin hielo', category: 'Cócteles' },
    ]);
    const pending = await rows<{ migration_name: string }>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name LIKE '202610%'`,
    );
    expect(pending).toEqual([]);

    const again = await migrate(DATABASE_URL, MIGRATIONS_DIR);
    expect(again.applied).toEqual([...REVERSIBLE].reverse());
  });
});
