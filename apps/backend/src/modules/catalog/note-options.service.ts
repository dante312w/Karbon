import { Injectable } from '@nestjs/common';
import { ErrorCode, type NoteOptionDto } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { badRequest, conflict, notFound } from '../../common/errors/domain-error.js';
import { type CategoryNoteOption, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreateNoteOptionDto,
  ReorderNoteOptionsDto,
  UpdateNoteOptionDto,
} from './catalog.dto.js';
import { toNoteOptionDto } from './catalog.mapper.js';

const DUPLICATE_MESSAGE = 'Esa nota ya existe en la categoría';

/** Espacios repetidos o en los extremos no hacen una nota distinta. */
function normalizeLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ');
  if (!normalized) throw badRequest('Escribe el texto de la nota');
  return normalized;
}

/**
 * Notas de un toque por categoría. Los pedidos guardan el texto, no la opción: editar o borrar
 * una nota nunca cambia lo que ya se pidió.
 */
@Injectable()
export class NoteOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Generales y de categorías vigentes. El mesero solo recibe las activas. */
  async list(includeInactive = false): Promise<NoteOptionDto[]> {
    const options = await this.prisma.categoryNoteOption.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        OR: [{ categoryId: null }, { category: { deletedAt: null } }],
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return options.map(toNoteOptionDto);
  }

  async create(dto: CreateNoteOptionDto): Promise<NoteOptionDto> {
    const categoryId = dto.categoryId ?? null;
    const label = normalizeLabel(dto.label);
    if (categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: categoryId, deletedAt: null },
        select: { id: true },
      });
      if (!category) throw notFound('La categoría');
    }
    await this.assertUnique(categoryId, label);
    const last = await this.prisma.categoryNoteOption.aggregate({
      where: { categoryId },
      _max: { sortOrder: true },
    });
    const option = await this.guardDuplicate(() =>
      this.prisma.categoryNoteOption.create({
        data: { categoryId, label, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      }),
    );
    return toNoteOptionDto(option);
  }

  async update(id: string, dto: UpdateNoteOptionDto): Promise<NoteOptionDto> {
    const current = await this.find(id);
    const label = dto.label === undefined ? undefined : normalizeLabel(dto.label);
    if (label !== undefined) await this.assertUnique(current.categoryId, label, id);
    const option = await this.guardDuplicate(() =>
      this.prisma.categoryNoteOption.update({
        where: { id },
        data: {
          ...(label === undefined ? {} : { label }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      }),
    );
    return toNoteOptionDto(option);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const option = await this.find(id);
    await this.prisma.categoryNoteOption.delete({ where: { id } });
    await this.audit.log({
      userId: user.id,
      action: 'note_option.delete',
      entity: 'category_note_option',
      entityId: id,
      metadata: { label: option.label, categoryId: option.categoryId },
    });
  }

  /**
   * El nuevo orden debe nombrar exactamente las notas del grupo (activas o no): si otro equipo
   * agregó o borró una mientras tanto, se rechaza en lugar de dejar el orden a medias.
   */
  async reorder(dto: ReorderNoteOptionsDto): Promise<NoteOptionDto[]> {
    const categoryId = dto.categoryId ?? null;
    if (new Set(dto.ids).size !== dto.ids.length) {
      throw badRequest('Una nota aparece más de una vez');
    }
    const options = await this.prisma.$transaction(async (tx) => {
      const current = await tx.categoryNoteOption.findMany({
        where: { categoryId },
        select: { id: true },
      });
      const known = new Set(current.map((option) => option.id));
      if (current.length !== dto.ids.length || dto.ids.some((id) => !known.has(id))) {
        throw conflict(
          ErrorCode.CONFLICT,
          'Las notas cambiaron mientras las ordenabas; vuelve a intentarlo',
        );
      }
      for (const [index, id] of dto.ids.entries()) {
        await tx.categoryNoteOption.update({ where: { id }, data: { sortOrder: index } });
      }
      return tx.categoryNoteOption.findMany({
        where: { categoryId },
        orderBy: { sortOrder: 'asc' },
      });
    });
    return options.map(toNoteOptionDto);
  }

  private async find(id: string): Promise<CategoryNoteOption> {
    const option = await this.prisma.categoryNoteOption.findUnique({ where: { id } });
    if (!option) throw notFound('La nota');
    return option;
  }

  private async assertUnique(categoryId: string | null, label: string, exceptId?: string) {
    const duplicate = await this.prisma.categoryNoteOption.findFirst({
      where: {
        categoryId,
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
}
