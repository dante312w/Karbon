import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@karbon/types';
import { catchError, from, map, type Observable, of, switchMap, throwError } from 'rxjs';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-user.js';
import { DomainError, conflict } from '../errors/domain-error.js';

const HEADER = 'idempotency-key';
const KEY_PATTERN = /^[\w-]{8,100}$/;

/**
 * Hace idempotente una operación cuando el cliente envía `Idempotency-Key`: el primer intento
 * se ejecuta y su respuesta se guarda; los reintentos con la misma clave reciben esa respuesta.
 * Imprescindible para las colas offline de los celulares y los reintentos por red inestable.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = request.headers[HEADER];
    const userId = request.user?.id;
    if (typeof key !== 'string' || !userId) return next.handle();
    if (!KEY_PATTERN.test(key)) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Idempotency-Key inválida',
        HttpStatus.BAD_REQUEST,
      );
    }
    // Nest aplica el código HTTP después de los interceptores: se toma de la metadata.
    const statusCode =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ??
      (request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);
    const route = `${request.method} ${(request.route as { path?: string } | undefined)?.path ?? request.path}`;
    const where = { userId_key: { userId, key } };

    return from(this.claim(userId, key, route)).pipe(
      switchMap((stored) => {
        if (stored !== null) return of(stored);
        return next.handle().pipe(
          switchMap((body: unknown) =>
            from(
              this.prisma.idempotencyKey.update({
                where,
                data: { statusCode, response: body ?? Prisma.JsonNull },
              }),
            ).pipe(map(() => body)),
          ),
          catchError((error: unknown) =>
            // Un fallo libera la clave para que el cliente pueda reintentar.
            from(this.prisma.idempotencyKey.deleteMany({ where: { userId, key } })).pipe(
              switchMap(() => throwError(() => error)),
            ),
          ),
        );
      }),
    );
  }

  /** Reserva la clave; si ya existe devuelve la respuesta guardada. */
  private async claim(userId: string, key: string, route: string): Promise<unknown> {
    try {
      await this.prisma.idempotencyKey.create({ data: { userId, key, route } });
      return null;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
    }
    const existing = await this.prisma.idempotencyKey.findUniqueOrThrow({
      where: { userId_key: { userId, key } },
    });
    if (existing.route !== route) {
      throw conflict(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'La clave de idempotencia ya se usó en otra operación',
      );
    }
    if (existing.statusCode === null) {
      throw conflict(
        ErrorCode.IDEMPOTENCY_IN_PROGRESS,
        'La operación original todavía está en curso',
      );
    }
    return existing.response;
  }
}

/** Marca un endpoint como idempotente con la cabecera `Idempotency-Key`. */
export const Idempotent = (): MethodDecorator & ClassDecorator =>
  UseInterceptors(IdempotencyInterceptor);
