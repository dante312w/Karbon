import type { AuditLogDto, CategoryDto, NoteOptionDto, Paginated, ProductDto } from '@karbon/types';
import { noteSuggestions } from '@karbon/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiClient,
  EventProbe,
  type Harness,
  loginWithPassword,
  loginWithPin,
  startApp,
} from './integration/harness.js';

/**
 * Notas de un toque: una nota aplica a varias categorías (y, como excepción, a productos), las
 * administra el catálogo y el mesero solo ve las que tienen sentido para cada producto.
 */
describe('Notas de un toque (integración)', () => {
  let harness: Harness;
  let admin: ApiClient;
  let waiter: ApiClient;
  let kitchen: ApiClient;
  let categories: CategoryDto[];
  let products: ProductDto[];
  let burgers: CategoryDto;
  let drinks: CategoryDto;

  const waiterNotes = async (): Promise<NoteOptionDto[]> =>
    (await waiter.get('/note-options').expect(200)).body as NoteOptionDto[];
  const allNotes = async (): Promise<NoteOptionDto[]> =>
    (await admin.get('/note-options?includeInactive=true').expect(200)).body as NoteOptionDto[];
  const byLabel = async (label: string): Promise<NoteOptionDto> => {
    const found = (await allNotes()).find((note) => note.label === label);
    if (!found) throw new Error(`Falta la nota ${label}`);
    return found;
  };
  const category = (name: string): CategoryDto => {
    const found = categories.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`La categoría ${name} no está en el seed`);
    return found;
  };
  const productIn = (categoryId: string): ProductDto => {
    const found = products.find((product) => product.categoryId === categoryId);
    if (!found) throw new Error('Categoría sin productos en el seed');
    return found;
  };
  /** Lo que el mesero ve al pedir el producto (la misma regla que usan las apps). */
  const offeredFor = async (product: ProductDto): Promise<string[]> =>
    noteSuggestions(await waiterNotes(), categories, product);

  beforeAll(async () => {
    harness = await startApp();
    admin = await loginWithPassword(harness, 'admin', 'Admin123*');
    waiter = await loginWithPin(harness, 'Laura', '2222');
    kitchen = await loginWithPin(harness, 'Cocina', '4444');
    categories = (await admin.get('/categories').expect(200)).body as CategoryDto[];
    products = (await admin.get('/products').expect(200)).body as ProductDto[];
    burgers = category('Hamburguesas');
    drinks = category('Bebidas');
  });

  afterAll(async () => {
    await harness.close();
  });

  it('el seed crea cada texto una sola vez y lo asigna a sus categorías', async () => {
    const notes = await waiterNotes();
    expect(notes.filter((note) => note.isGeneral).map((note) => note.label)).toEqual([
      'Para llevar',
    ]);
    const labels = notes.map((note) => note.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    expect((await offeredFor(productIn(burgers.id))).slice(0, 3)).toEqual([
      'Sin cebolla',
      'Sin tomate',
      'Extra queso',
    ]);
  });

  it('al pedir una bebida no aparecen notas de comida (y viceversa)', async () => {
    const drink = await offeredFor(productIn(drinks.id));
    expect(drink).toContain('Sin hielo');
    expect(drink).not.toContain('Sin cebolla');
    expect(drink.at(-1)).toBe('Para llevar');
    expect(await offeredFor(productIn(burgers.id))).not.toContain('Sin hielo');
  });

  it('solo el catálogo las administra; cocina ni siquiera las lee', async () => {
    await waiter
      .post('/note-options', { label: 'Doble carne', categoryIds: [burgers.id] })
      .expect(403);
    await waiter.put(`/categories/${burgers.id}/note-options`, { noteOptionIds: [] }).expect(403);
    await kitchen.get('/note-options').expect(403);
  });

  it('una nota con varias categorías; rechaza repetidas, vacías y generales con categorías', async () => {
    const created = (
      await admin
        .post('/note-options', { label: '  Doble   carne ', categoryIds: [burgers.id, drinks.id] })
        .expect(201)
    ).body as NoteOptionDto;
    expect(created.label).toBe('Doble carne');
    expect(created.isGeneral).toBe(false);
    expect(created.categories.map((link) => link.categoryId).sort()).toEqual(
      [burgers.id, drinks.id].sort(),
    );
    // Va al final de cada categoría.
    expect((await offeredFor(productIn(burgers.id))).indexOf('Doble carne')).toBeGreaterThan(2);

    await admin.post('/note-options', { label: 'doble CARNE' }).expect(409);
    await admin.post('/note-options', { label: '   ' }).expect(400);
    await admin.patch(`/note-options/${created.id}`, { label: 'SIN CEBOLLA' }).expect(409);
    await admin
      .post('/note-options', { label: 'Otra', isGeneral: true, categoryIds: [burgers.id] })
      .expect(400);
    await admin
      .post('/note-options', {
        label: 'Otra',
        categoryIds: ['00000000-0000-0000-0000-000000000000'],
      })
      .expect(404);

    // Cambiar sus categorías reemplaza la lista.
    const updated = (
      await admin.patch(`/note-options/${created.id}`, { categoryIds: [burgers.id] }).expect(200)
    ).body as NoteOptionDto;
    expect(updated.categories.map((link) => link.categoryId)).toEqual([burgers.id]);
    expect(await offeredFor(productIn(drinks.id))).not.toContain('Doble carne');
  });

  it('una nota sin categoría ni productos no se ofrece; general se ofrece en todo', async () => {
    const orphan = (await admin.post('/note-options', { label: 'Sin asignar' }).expect(201))
      .body as NoteOptionDto;
    expect(orphan.isGeneral).toBe(false);
    expect(await offeredFor(productIn(burgers.id))).not.toContain('Sin asignar');
    expect(await offeredFor(productIn(drinks.id))).not.toContain('Sin asignar');

    const general = (
      await admin.patch(`/note-options/${orphan.id}`, { isGeneral: true }).expect(200)
    ).body as NoteOptionDto;
    expect(general.isGeneral).toBe(true);
    expect(await offeredFor(productIn(drinks.id))).toContain('Sin asignar');
    await admin.delete(`/note-options/${orphan.id}`).expect(204);
  });

  it('asignación masiva desde la categoría: exactamente esas notas, en ese orden', async () => {
    const extra = await byLabel('Doble carne');
    const ice = await byLabel('Sin hielo');
    await admin
      .put(`/categories/${drinks.id}/note-options`, { noteOptionIds: [extra.id, ice.id] })
      .expect(200);
    expect((await offeredFor(productIn(drinks.id))).slice(0, 3)).toEqual([
      'Doble carne',
      'Sin hielo',
      'Para llevar',
    ]);
    // Las otras categorías de la nota no cambian.
    expect(await offeredFor(productIn(burgers.id))).toContain('Doble carne');
    // Una general no se asigna: ya aplica a todo.
    const takeaway = await byLabel('Para llevar');
    await admin
      .put(`/categories/${drinks.id}/note-options`, { noteOptionIds: [takeaway.id] })
      .expect(400);
  });

  it('las notas propias de un producto reemplazan las de su categoría', async () => {
    const burger = productIn(burgers.id);
    const own = (
      await admin
        .post('/note-options', { label: 'Pan sin gluten', productIds: [burger.id] })
        .expect(201)
    ).body as NoteOptionDto;
    expect(await offeredFor(burger)).toEqual(['Pan sin gluten', 'Para llevar']);
    // Otro producto de la misma categoría sigue con las de la categoría.
    const other = products.find(
      (product) => product.categoryId === burgers.id && product.id !== burger.id,
    );
    if (other) expect(await offeredFor(other)).not.toContain('Pan sin gluten');

    // Vaciar las propias devuelve el producto a su categoría.
    await admin.put(`/products/${burger.id}/note-options`, { noteOptionIds: [] }).expect(200);
    expect((await offeredFor(burger))[0]).toBe('Sin cebolla');
    await admin.put(`/products/${burger.id}/note-options`, { noteOptionIds: [own.id] }).expect(200);
    expect((await offeredFor(burger))[0]).toBe('Pan sin gluten');
    await admin.delete(`/note-options/${own.id}`).expect(204);
    expect((await offeredFor(burger))[0]).toBe('Sin cebolla');
  });

  it('una nota apagada deja de verla el mesero, pero sigue en el catálogo', async () => {
    const target = await byLabel('Doble carne');
    await admin.patch(`/note-options/${target.id}`, { isActive: false }).expect(200);
    expect((await waiterNotes()).some((note) => note.id === target.id)).toBe(false);
    expect((await byLabel('Doble carne')).isActive).toBe(false);
  });

  it('reordena una categoría o las generales y rechaza un orden desactualizado', async () => {
    const ids = (await allNotes())
      .filter((note) => note.categories.some((link) => link.categoryId === burgers.id))
      .sort(
        (a, b) =>
          (a.categories.find((link) => link.categoryId === burgers.id)?.sortOrder ?? 0) -
          (b.categories.find((link) => link.categoryId === burgers.id)?.sortOrder ?? 0),
      )
      .map((note) => note.id);
    const reversed = [...ids].reverse();
    await admin.put('/note-options/order', { categoryId: burgers.id, ids: reversed }).expect(200);
    const order = (await allNotes())
      .filter((note) => note.categories.some((link) => link.categoryId === burgers.id))
      .sort(
        (a, b) =>
          (a.categories.find((link) => link.categoryId === burgers.id)?.sortOrder ?? 0) -
          (b.categories.find((link) => link.categoryId === burgers.id)?.sortOrder ?? 0),
      )
      .map((note) => note.id);
    expect(order).toEqual(reversed);

    await admin
      .put('/note-options/order', { categoryId: burgers.id, ids: reversed.slice(1) })
      .expect(409);
    await admin.put('/note-options/order', { categoryId: null, ids: reversed }).expect(409);
  });

  it('la asignación sugerida se aplica de una vez y avisa a los celulares', async () => {
    const probe = new EventProbe(harness, waiter.session.accessToken);
    await probe.connected();
    const loose = (
      await admin
        .post('/note-options', { label: 'Bien fría y sin limón', isGeneral: true })
        .expect(201)
    ).body as NoteOptionDto;
    await probe.waitForCount('note_options.changed', 1);

    await admin
      .put('/note-options/assignments', {
        assignments: [{ noteOptionId: loose.id, isGeneral: false, categoryIds: [drinks.id] }],
      })
      .expect(200);
    await probe.waitForCount('note_options.changed', 2);
    const assigned = await byLabel('Bien fría y sin limón');
    expect(assigned.isGeneral).toBe(false);
    expect(assigned.categories.map((link) => link.categoryId)).toEqual([drinks.id]);
    expect(await offeredFor(productIn(burgers.id))).not.toContain('Bien fría y sin limón');

    // Todo o nada: una asignación inválida no deja cambios a medias.
    await admin
      .put('/note-options/assignments', {
        assignments: [
          { noteOptionId: loose.id, isGeneral: true, categoryIds: [] },
          { noteOptionId: loose.id, isGeneral: false, categoryIds: [burgers.id] },
        ],
      })
      .expect(400);
    expect((await byLabel('Bien fría y sin limón')).isGeneral).toBe(false);
    probe.close();

    const logs = (await admin.get('/audit-logs?search=note_option.assign').expect(200))
      .body as Paginated<AuditLogDto>;
    expect(logs.items.length).toBeGreaterThan(0);
  });

  it('eliminar una nota queda auditado', async () => {
    const target = await byLabel('Doble carne');
    await admin.delete(`/note-options/${target.id}`).expect(204);
    await admin.delete(`/note-options/${target.id}`).expect(404);
    const logs = (await admin.get('/audit-logs?search=note_option.delete').expect(200))
      .body as Paginated<AuditLogDto>;
    expect(logs.items.some((log) => log.entityId === target.id)).toBe(true);
  });

  it('borrar una categoría vacía le quita sus notas; con subcategorías no se puede', async () => {
    const parent = (await admin.post('/categories', { name: 'Temporada' }).expect(201))
      .body as CategoryDto;
    const child = (
      await admin.post('/categories', { name: 'Temporada dulce', parentId: parent.id }).expect(201)
    ).body as CategoryDto;
    const cinnamon = (
      await admin
        .post('/note-options', { label: 'Sin canela', categoryIds: [parent.id, burgers.id] })
        .expect(201)
    ).body as NoteOptionDto;

    await admin.delete(`/categories/${parent.id}`).expect(409);
    await admin.delete(`/categories/${child.id}`).expect(204);
    await admin.delete(`/categories/${parent.id}`).expect(204);
    // La nota sigue en su otra categoría.
    expect((await byLabel('Sin canela')).categories.map((link) => link.categoryId)).toEqual([
      burgers.id,
    ]);
    await admin.post('/note-options', { label: 'Otra', categoryIds: [parent.id] }).expect(404);
    await admin.delete(`/note-options/${cinnamon.id}`).expect(204);
  });
});
