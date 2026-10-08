import {
  type BusinessMode,
  FiscalDocumentType,
  IdentityDocumentType,
  InventoryMovementType,
  SystemRole,
  systemRolePermissions,
} from '@karbon/types';
import { hashSecret } from '../../common/security/secret-hasher.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../../prisma/prisma.types.js';
import {
  DEFAULT_GENERAL_NOTES,
  DEFAULT_TAXES,
  DEMO_CUSTOMER,
  DEMO_DATASETS,
  DEMO_STAFF_PASSWORD,
  DEMO_SUPPLIER,
  defaultOpeningHours,
  systemRoles,
} from './seed-data.js';

/**
 * Pasos del seed reutilizables: los usa el seed de línea de comandos y el asistente de primer
 * arranque del instalador. Todos son idempotentes.
 */

function getOrThrow<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed inconsistente: falta la clave ${String(key)}`);
  return value;
}

/** Roles de sistema: siempre sincronizados con el código (permisos y nombre según el modo). */
export async function seedRoles(tx: Tx, mode: BusinessMode): Promise<Map<SystemRole, string>> {
  const definitions = systemRoles(mode);
  const ids = new Map<SystemRole, string>();
  for (const code of Object.values(SystemRole)) {
    const data = {
      ...definitions[code],
      permissions: systemRolePermissions(code, mode),
      isSystem: true,
    };
    const role = await tx.role.upsert({ where: { code }, update: data, create: { code, ...data } });
    ids.set(code, role.id);
  }
  return ids;
}

export async function seedBaseConfiguration(
  tx: Tx,
  mode: BusinessMode,
  restaurantName: string,
): Promise<void> {
  await tx.restaurantSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: restaurantName,
      businessMode: mode,
      openingHours: defaultOpeningHours(mode),
      receiptFooter: '¡Gracias por su visita!',
    },
  });
  if ((await tx.tax.count()) === 0) {
    await tx.tax.createMany({ data: DEFAULT_TAXES.map((tax) => ({ ...tax })) });
  }
  if ((await tx.numberingRange.count()) === 0) {
    await tx.numberingRange.create({
      data: {
        documentType: FiscalDocumentType.RECEIPT,
        prefix: 'T',
        rangeFrom: 1,
        rangeTo: 999_999_999,
        nextNumber: 1,
      },
    });
  }
  if ((await tx.noteOption.count()) === 0) {
    await tx.noteOption.createMany({
      data: DEFAULT_GENERAL_NOTES[mode].map((label, sortOrder) => ({
        label,
        sortOrder,
        isGeneral: true,
      })),
    });
  }
}

/**
 * Asigna a la categoría sus notas de ejemplo. Cada texto existe una sola vez: si otra categoría ya
 * lo creó, se reutiliza; si es general, ya aplica y no se asigna.
 */
async function linkDemoNotes(tx: Tx, categoryId: string, labels: readonly string[]) {
  for (const [sortOrder, label] of labels.entries()) {
    const existing = await tx.noteOption.findFirst({
      where: { label: { equals: label, mode: 'insensitive' } },
      select: { id: true, isGeneral: true },
    });
    if (existing?.isGeneral) continue;
    const noteOptionId =
      existing?.id ??
      (
        await tx.noteOption.create({
          data: { label, sortOrder: await tx.noteOption.count() },
          select: { id: true },
        })
      ).id;
    await tx.noteOptionCategory.create({ data: { noteOptionId, categoryId, sortOrder } });
  }
}

export interface AdminInput {
  name: string;
  username: string;
  password: string;
  pin?: string | null;
}

/** Crea el administrador si no existe; nunca cambia la clave de uno existente. */
export async function seedAdmin(
  tx: Tx,
  roles: Map<SystemRole, string>,
  admin: AdminInput,
): Promise<string> {
  const username = admin.username.trim().toLowerCase();
  const existing = await tx.user.findUnique({ where: { username } });
  if (existing) return existing.id;
  const [passwordHash, pinHash] = await Promise.all([
    hashSecret(admin.password),
    admin.pin ? hashSecret(admin.pin) : Promise.resolve(null),
  ]);
  const created = await tx.user.create({
    data: {
      name: admin.name,
      username,
      passwordHash,
      pinHash,
      roleId: getOrThrow(roles, SystemRole.ADMIN),
    },
  });
  await tx.restaurantSettings.update({ where: { id: 1 }, data: { setupCompletedAt: new Date() } });
  return created.id;
}

/**
 * Catálogo, salón, personal e inventario de demostración del modo elegido (solo con catálogo
 * vacío). `businessIdentity` también reemplaza nombre, NIT y dirección por los de ejemplo:
 * el asistente de primer arranque lo desactiva para no poner datos ficticios en los recibos.
 */
export async function seedDemoData(
  tx: Tx,
  mode: BusinessMode,
  roles: Map<SystemRole, string>,
  adminId: string,
  { businessIdentity = true }: { businessIdentity?: boolean } = {},
): Promise<boolean> {
  if ((await tx.product.count()) > 0) return false;
  const dataset = DEMO_DATASETS[mode];

  const passwordHash = await hashSecret(DEMO_STAFF_PASSWORD);
  const staff = await Promise.all(
    dataset.staff.map(async (member) => ({ ...member, pinHash: await hashSecret(member.pin) })),
  );
  for (const member of staff) {
    await tx.user.upsert({
      where: { username: member.username },
      update: {},
      create: {
        username: member.username,
        name: member.name,
        roleId: getOrThrow(roles, member.role),
        passwordHash,
        pinHash: member.pinHash,
      },
    });
  }

  if (businessIdentity)
    await tx.restaurantSettings.update({
      where: { id: 1 },
      data: {
        name: dataset.businessName,
        legalName: dataset.legalName,
        taxId: dataset.taxId,
        address: dataset.address,
        city: 'Bogotá',
        phone: '6017654321',
        businessMode: mode,
        openingHours: defaultOpeningHours(mode),
      },
    });

  for (const [sortOrder, area] of dataset.areas.entries()) {
    const { id: areaId } = await tx.area.upsert({
      where: { name: area.name },
      update: {},
      create: { name: area.name, sortOrder },
    });
    if ((await tx.diningTable.count({ where: { areaId } })) === 0) {
      await tx.diningTable.createMany({ data: area.tables.map((table) => ({ ...table, areaId })) });
    }
    if (area.elements && (await tx.floorElement.count({ where: { areaId } })) === 0) {
      await tx.floorElement.createMany({
        data: area.elements.map((item) => ({ ...item, areaId })),
      });
    }
  }

  const categoryIds = new Map<string, string>();
  for (const [sortOrder, category] of dataset.categories.entries()) {
    const created = await tx.category.create({
      data: {
        name: category.name,
        color: category.color,
        sortOrder,
      },
    });
    await linkDemoNotes(tx, created.id, category.notes);
    categoryIds.set(category.key, created.id);
  }

  const ingredients = new Map<string, { id: string; cost: Prisma.Decimal }>();
  for (const item of dataset.ingredients) {
    const cost = new Prisma.Decimal(item.cost);
    const ingredient = await tx.ingredient.create({
      data: {
        name: item.name,
        unit: item.unit,
        stock: item.stock,
        minStock: item.minStock,
        averageCost: cost,
        lastCost: cost,
        movements: {
          create: {
            type: InventoryMovementType.ENTRY,
            quantity: item.stock,
            balanceAfter: item.stock,
            unitCost: cost,
            reason: 'Inventario inicial',
            userId: adminId,
          },
        },
      },
    });
    ingredients.set(item.key, { id: ingredient.id, cost });
  }

  const defaultTax = await tx.tax.findFirstOrThrow({ where: { isDefault: true } });
  for (const [sortOrder, product] of dataset.products.entries()) {
    const recipe = product.recipe.map(([key, quantity]) => ({
      ingredient: getOrThrow(ingredients, key),
      quantity: new Prisma.Decimal(quantity),
    }));
    const cost = recipe
      .reduce(
        (sum, line) => sum.add(line.quantity.mul(line.ingredient.cost)),
        new Prisma.Decimal(0),
      )
      .toDecimalPlaces(2);
    await tx.product.create({
      data: {
        name: product.name,
        price: product.price,
        cost,
        station: product.station,
        sortOrder,
        categoryId: getOrThrow(categoryIds, product.category),
        taxId: defaultTax.id,
        recipeItems: {
          create: recipe.map((line) => ({
            ingredientId: line.ingredient.id,
            quantity: line.quantity,
          })),
        },
      },
    });
  }

  await tx.supplier.create({ data: DEMO_SUPPLIER });
  await tx.customer.create({ data: { ...DEMO_CUSTOMER, documentType: IdentityDocumentType.CC } });
  return true;
}
