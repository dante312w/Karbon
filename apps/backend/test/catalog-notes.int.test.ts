import type { AuditLogDto, CategoryDto, NoteOptionDto, Paginated } from '@karbon/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiClient,
  type Harness,
  loginWithPassword,
  loginWithPin,
  startApp,
} from './integration/harness.js';

/** Notas de un toque por categoría: las administra el catálogo y las lee el mesero. */
describe('Notas de un toque (integración)', () => {
  let harness: Harness;
  let admin: ApiClient;
  let waiter: ApiClient;
  let kitchen: ApiClient;
  let burgers: CategoryDto;

  const waiterNotes = async (): Promise<NoteOptionDto[]> =>
    (await waiter.get('/note-options').expect(200)).body as NoteOptionDto[];
  const allNotes = async (): Promise<NoteOptionDto[]> =>
    (await admin.get('/note-options?includeInactive=true').expect(200)).body as NoteOptionDto[];
  const labelsOf = (notes: NoteOptionDto[], categoryId: string | null): string[] =>
    notes
      .filter((note) => note.categoryId === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((note) => note.label);

  beforeAll(async () => {
    harness = await startApp();
    admin = await loginWithPassword(harness, 'admin', 'Admin123*');
    waiter = await loginWithPin(harness, 'Laura', '2222');
    kitchen = await loginWithPin(harness, 'Cocina', '4444');
    const categories = (await admin.get('/categories').expect(200)).body as CategoryDto[];
    const found = categories.find((category) => category.name === 'Hamburguesas');
    if (!found) throw new Error('La categoría Hamburguesas no está en el seed');
    burgers = found;
  });

  afterAll(async () => {
    await harness.close();
  });

  it('el seed trae notas generales y de cada categoría, en su orden', async () => {
    const notes = await waiterNotes();
    expect(labelsOf(notes, null)).toEqual(['Para llevar']);
    expect(labelsOf(notes, burgers.id).slice(0, 3)).toEqual([
      'Sin cebolla',
      'Sin tomate',
      'Extra queso',
    ]);
  });

  it('solo el catálogo las administra; cocina ni siquiera las lee', async () => {
    await waiter
      .post('/note-options', { categoryId: burgers.id, label: 'Doble carne' })
      .expect(403);
    await kitchen.get('/note-options').expect(403);
  });

  it('crea al final del grupo y rechaza repetidas o vacías', async () => {
    const created = (
      await admin
        .post('/note-options', { categoryId: burgers.id, label: '  Doble   carne ' })
        .expect(201)
    ).body as NoteOptionDto;
    expect(created.label).toBe('Doble carne');
    expect(labelsOf(await allNotes(), burgers.id).at(-1)).toBe('Doble carne');

    await admin.post('/note-options', { categoryId: burgers.id, label: 'doble CARNE' }).expect(409);
    await admin.post('/note-options', { categoryId: burgers.id, label: '   ' }).expect(400);
    await admin.patch(`/note-options/${created.id}`, { label: 'SIN CEBOLLA' }).expect(409);
    // La misma nota en otra categoría o como general sí es válida.
    const general = (await admin.post('/note-options', { label: 'Doble carne' }).expect(201))
      .body as NoteOptionDto;
    expect(general.categoryId).toBeNull();
    await admin.delete(`/note-options/${general.id}`).expect(204);
  });

  it('una nota apagada deja de verla el mesero, pero sigue en el catálogo', async () => {
    const target = (await allNotes()).find(
      (note) => note.categoryId === burgers.id && note.label === 'Doble carne',
    );
    if (!target) throw new Error('Falta la nota creada');
    await admin.patch(`/note-options/${target.id}`, { isActive: false }).expect(200);
    expect((await waiterNotes()).some((note) => note.id === target.id)).toBe(false);
    expect((await allNotes()).find((note) => note.id === target.id)?.isActive).toBe(false);
  });

  it('reordena el grupo completo y rechaza un orden desactualizado', async () => {
    const ids = (await allNotes())
      .filter((note) => note.categoryId === burgers.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((note) => note.id);
    const reversed = [...ids].reverse();
    const result = (
      await admin.put('/note-options/order', { categoryId: burgers.id, ids: reversed }).expect(200)
    ).body as NoteOptionDto[];
    expect(result.map((note) => note.id)).toEqual(reversed);

    await admin
      .put('/note-options/order', { categoryId: burgers.id, ids: reversed.slice(1) })
      .expect(409);
    await admin.put('/note-options/order', { categoryId: null, ids: reversed }).expect(409);
  });

  it('eliminar una nota queda auditado', async () => {
    const target = (await allNotes()).find((note) => note.label === 'Doble carne');
    if (!target) throw new Error('Falta la nota creada');
    await admin.delete(`/note-options/${target.id}`).expect(204);
    await admin.delete(`/note-options/${target.id}`).expect(404);
    const logs = (await admin.get('/audit-logs?search=note_option.delete').expect(200))
      .body as Paginated<AuditLogDto>;
    expect(logs.items.some((log) => log.entityId === target.id)).toBe(true);
  });

  it('borrar una categoría vacía se lleva sus notas; con subcategorías no se puede', async () => {
    const parent = (await admin.post('/categories', { name: 'Temporada' }).expect(201))
      .body as CategoryDto;
    const child = (
      await admin.post('/categories', { name: 'Temporada dulce', parentId: parent.id }).expect(201)
    ).body as CategoryDto;
    await admin.post('/note-options', { categoryId: parent.id, label: 'Sin canela' }).expect(201);

    await admin.delete(`/categories/${parent.id}`).expect(409);
    await admin.delete(`/categories/${child.id}`).expect(204);
    await admin.delete(`/categories/${parent.id}`).expect(204);
    expect((await allNotes()).some((note) => note.categoryId === parent.id)).toBe(false);
    await admin.post('/note-options', { categoryId: parent.id, label: 'Otra' }).expect(404);
  });
});
