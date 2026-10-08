import { Injectable } from '@nestjs/common';
import { ErrorCode, type NoteOptionDto, SocketEvent } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest, conflict, notFound } from '../../common/errors/domain-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db, Tx } from '../../prisma/prisma.types.js';
import { AuditService } from '../audit/audit.service.js';
import { EVENT_ROOMS, EventsService } from '../realtime/events.service.js';
import type {
  AssignNoteOptionsDto,
  CreateNoteOptionDto,
  ReorderNoteOptionsDto,
  SetNoteOptionsDto,
  UpdateNoteOptionDto,
} from './catalog.dto.js';
import { NOTE_OPTION_INCLUDE, type NoteOptionRow, toNoteOptionDto } from './catalog.mapper.js';

const DUPLICATE_MESSAGE = 'Esa nota ya existe';
const GENERAL_WITH_LINKS = 'Una nota general se ofrece en todos los productos: no lleva categorías';

/** Espacios repetidos o en los extremos no hacen una nota distinta. */
function normalizeLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ');
  if (!normalized) throw badRequest('Escribe el texto de la nota');
  return normalized;
}

/**
 * Notas de un toque. Una general se ofrece en todos los productos; las demás se asignan a
 * categorías (muchas a muchas) y, como excepción, a productos puntuales. Los pedidos guardan el
 * texto, no la opción: editar o borrar una nota nunca cambia lo que ya se pidió.
 */
@Injectable()
export class NoteOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  /** El mesero solo recibe las activas. */
  async list(includeInactive = false): Promise<NoteOptionDto[]> {
    const options = await this.prisma.noteOption.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: NOTE_OPTION_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return options.map(toNoteOptionDto);
  }

  async create(dto: CreateNoteOptionDto): Promise<NoteOptionDto> {
    const label = normalizeLabel(dto.label);
    const isGeneral = dto.isGeneral ?? false;
    const categoryIds = dto.categoryIds ?? [];
    const productIds = dto.productIds ?? [];
    if (isGeneral && (categoryIds.length > 0 || productIds.length > 0)) {
      throw badRequest(GENERAL_WITH_LINKS);
    }
    const option = await this.guardDuplicate(() =>
      this.prisma.$transaction(async (tx) => {
        await this.assertUnique(tx, label);
        await this.assertCategories(tx, categoryIds);
        await this.assertProducts(tx, productIds);
        const created = await tx.noteOption.create({
          data: { label, isGeneral, sortOrder: await this.nextGeneralOrder(tx) },
        });
        await this.replaceCategories(tx, created.id, categoryIds);
        await this.replaceProducts(tx, created.id, productIds);
        return this.load(tx, created.id);
      }),
    );
    this.publishChanged();
    return toNoteOptionDto(option);
  }

  /** Las listas reemplazan las asignaciones; volverla general quita sus categorías y productos. */
  async update(id: string, dto: UpdateNoteOptionDto): Promise<NoteOptionDto> {
    const label = dto.label === undefined ? undefined : normalizeLabel(dto.label);
    const option = await this.guardDuplicate(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await this.find(tx, id);
        const isGeneral = dto.isGeneral ?? current.isGeneral;
        if (isGeneral && (dto.categoryIds?.length || dto.productIds?.length)) {
          throw badRequest(GENERAL_WITH_LINKS);
        }
        if (label !== undefined) await this.assertUnique(tx, label, id);
        if (dto.categoryIds) await this.assertCategories(tx, dto.categoryIds);
        if (dto.productIds) await this.assertProducts(tx, dto.productIds);
        await tx.noteOption.update({
          where: { id },
          data: {
            ...(label === undefined ? {} : { label }),
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
            isGeneral,
            ...(isGeneral && !current.isGeneral
              ? { sortOrder: await this.nextGeneralOrder(tx) }
              : {}),
          },
        });
        if (isGeneral) {
          await this.replaceCategories(tx, id, []);
          await this.replaceProducts(tx, id, []);
        } else {
          if (dto.categoryIds) await this.replaceCategories(tx, id, dto.categoryIds);
          if (dto.productIds) await this.replaceProducts(tx, id, dto.productIds);
        }
        return this.load(tx, id);
      }),
    );
    this.publishChanged();
    return toNoteOptionDto(option);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const option = await this.find(this.prisma, id);
    await this.prisma.noteOption.delete({ where: { id } });
    await this.audit.log({
      userId: user.id,
      action: 'note_option.delete',
      entity: 'note_option',
      entityId: id,
      metadata: {
        label: option.label,
        isGeneral: option.isGeneral,
        categoryIds: option.categories.map((link) => link.categoryId),
        productIds: option.products.map((link) => link.productId),
      },
    });
    this.publishChanged();
  }

  /**
   * Nuevo orden de las notas de una categoría (o de las generales). Debe nombrar exactamente las
   * del grupo: si otro equipo agregó o quitó una mientras tanto, se rechaza.
   */
  async reorder(dto: ReorderNoteOptionsDto): Promise<NoteOptionDto[]> {
    const categoryId = dto.categoryId ?? null;
    if (new Set(dto.ids).size !== dto.ids.length) {
      throw badRequest('Una nota aparece más de una vez');
    }
    await this.prisma.$transaction(async (tx) => {
      const current = categoryId
        ? (
            await tx.noteOptionCategory.findMany({
              where: { categoryId },
              select: { noteOptionId: true },
            })
          ).map((link) => link.noteOptionId)
        : (await tx.noteOption.findMany({ where: { isGeneral: true }, select: { id: true } })).map(
            (option) => option.id,
          );
      const known = new Set(current);
      if (current.length !== dto.ids.length || dto.ids.some((id) => !known.has(id))) {
        throw conflict(
          ErrorCode.CONFLICT,
          'Las notas cambiaron mientras las ordenabas; vuelve a intentarlo',
        );
      }
      for (const [index, id] of dto.ids.entries()) {
        if (categoryId) {
          await tx.noteOptionCategory.update({
            where: { noteOptionId_categoryId: { noteOptionId: id, categoryId } },
            data: { sortOrder: index },
          });
        } else {
          await tx.noteOption.update({ where: { id }, data: { sortOrder: index } });
        }
      }
    });
    this.publishChanged();
    return this.list(true);
  }

  /**
   * Asignación masiva desde la categoría: exactamente estas notas le aplican, en este orden. Las
   * que se quitan dejan de aplicarle; sus otras categorías no cambian.
   */
  async setForCategory(categoryId: string, dto: SetNoteOptionsDto): Promise<NoteOptionDto[]> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertCategories(tx, [categoryId]);
      await this.assertAssignable(tx, dto.noteOptionIds);
      await tx.noteOptionCategory.deleteMany({
        where: { categoryId, noteOptionId: { notIn: dto.noteOptionIds } },
      });
      for (const [sortOrder, noteOptionId] of dto.noteOptionIds.entries()) {
        await tx.noteOptionCategory.upsert({
          where: { noteOptionId_categoryId: { noteOptionId, categoryId } },
          create: { noteOptionId, categoryId, sortOrder },
          update: { sortOrder },
        });
      }
    });
    this.publishChanged();
    return this.list(true);
  }

  /** Notas propias del producto (reemplazan las de su categoría); vacía = vuelve a la categoría. */
  async setForProduct(productId: string, dto: SetNoteOptionsDto): Promise<NoteOptionDto[]> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertProducts(tx, [productId]);
      await this.assertAssignable(tx, dto.noteOptionIds);
      await tx.noteOptionProduct.deleteMany({
        where: { productId, noteOptionId: { notIn: dto.noteOptionIds } },
      });
      await tx.noteOptionProduct.createMany({
        data: dto.noteOptionIds.map((noteOptionId) => ({ noteOptionId, productId })),
        skipDuplicates: true,
      });
    });
    this.publishChanged();
    return this.list(true);
  }

  /**
   * Varias notas a la vez (la asignación sugerida por nombre de categoría): todo o nada. Las
   * categorías que una nota ya tenía conservan su orden; las nuevas van al final.
   */
  async assign(dto: AssignNoteOptionsDto, user: AuthenticatedUser): Promise<NoteOptionDto[]> {
    const ids = dto.assignments.map((assignment) => assignment.noteOptionId);
    if (new Set(ids).size !== ids.length) throw badRequest('Una nota aparece más de una vez');
    await this.prisma.$transaction(async (tx) => {
      for (const assignment of dto.assignments) {
        const current = await this.find(tx, assignment.noteOptionId);
        if (assignment.isGeneral && assignment.categoryIds.length > 0) {
          throw badRequest(GENERAL_WITH_LINKS);
        }
        await this.assertCategories(tx, assignment.categoryIds);
        await tx.noteOption.update({
          where: { id: current.id },
          data: {
            isGeneral: assignment.isGeneral,
            ...(assignment.isGeneral && !current.isGeneral
              ? { sortOrder: await this.nextGeneralOrder(tx) }
              : {}),
          },
        });
        await this.replaceCategories(tx, current.id, assignment.categoryIds);
        if (assignment.isGeneral) await this.replaceProducts(tx, current.id, []);
      }
      await this.audit.log(
        {
          userId: user.id,
          action: 'note_option.assign',
          entity: 'note_option',
          entityId: null,
          metadata: {
            assignments: dto.assignments.map(({ noteOptionId, isGeneral, categoryIds }) => ({
              noteOptionId,
              isGeneral,
              categoryIds,
            })),
          },
        },
        tx,
      );
    });
    this.publishChanged();
    return this.list(true);
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  private async find(db: Db, id: string): Promise<NoteOptionRow> {
    const option = await db.noteOption.findUnique({ where: { id }, include: NOTE_OPTION_INCLUDE });
    if (!option) throw notFound('La nota');
    return option;
  }

  private load(tx: Tx, id: string): Promise<NoteOptionRow> {
    return tx.noteOption.findUniqueOrThrow({ where: { id }, include: NOTE_OPTION_INCLUDE });
  }

  private async nextGeneralOrder(tx: Tx): Promise<number> {
    const last = await tx.noteOption.aggregate({ _max: { sortOrder: true } });
    return (last._max.sortOrder ?? -1) + 1;
  }

  /** Mantiene el orden de las categorías que ya tenía; las nuevas, al final de cada una. */
  private async replaceCategories(tx: Tx, noteOptionId: string, categoryIds: readonly string[]) {
    await tx.noteOptionCategory.deleteMany({
      where: { noteOptionId, categoryId: { notIn: [...categoryIds] } },
    });
    const existing = new Set(
      (
        await tx.noteOptionCategory.findMany({
          where: { noteOptionId },
          select: { categoryId: true },
        })
      ).map((link) => link.categoryId),
    );
    for (const categoryId of categoryIds) {
      if (existing.has(categoryId)) continue;
      const last = await tx.noteOptionCategory.aggregate({
        where: { categoryId },
        _max: { sortOrder: true },
      });
      await tx.noteOptionCategory.create({
        data: { noteOptionId, categoryId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
    }
  }

  private async replaceProducts(tx: Tx, noteOptionId: string, productIds: readonly string[]) {
    await tx.noteOptionProduct.deleteMany({
      where: { noteOptionId, productId: { notIn: [...productIds] } },
    });
    await tx.noteOptionProduct.createMany({
      data: productIds.map((productId) => ({ noteOptionId, productId })),
      skipDuplicates: true,
    });
  }

  private async assertCategories(db: Db, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await db.category.count({ where: { id: { in: [...ids] }, deletedAt: null } });
    if (found !== new Set(ids).size)
      throw notFound(ids.length === 1 ? 'La categoría' : 'Alguna categoría');
  }

  private async assertProducts(db: Db, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await db.product.count({ where: { id: { in: [...ids] }, deletedAt: null } });
    if (found !== new Set(ids).size)
      throw notFound(ids.length === 1 ? 'El producto' : 'Algún producto');
  }

  /** Las generales ya aplican a todo: no se asignan a una categoría ni a un producto. */
  private async assertAssignable(db: Db, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const options = await db.noteOption.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, isGeneral: true, label: true },
    });
    if (options.length !== ids.length) throw notFound('Alguna nota');
    const general = options.find((option) => option.isGeneral);
    if (general) {
      throw badRequest(`"${general.label}" es general: ya se ofrece en todos los productos`);
    }
  }

  private async assertUnique(db: Db, label: string, exceptId?: string): Promise<void> {
    const duplicate = await db.noteOption.findFirst({
      where: {
        label: { equals: label, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) throw conflict(ErrorCode.CONFLICT, DUPLICATE_MESSAGE);
  }

  /** El índice único resuelve la carrera entre dos equipos que crean la misma nota a la vez. */
  private async guardDuplicate<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict(ErrorCode.CONFLICT, DUPLICATE_MESSAGE);
      }
      throw error;
    }
  }

  /** Celulares y cajas recargan las notas (el socket solo avisa). */
  private publishChanged(): void {
    this.events.publish(SocketEvent.NOTE_OPTIONS_CHANGED, {}, EVENT_ROOMS.noteOptionsChanged);
  }
}
