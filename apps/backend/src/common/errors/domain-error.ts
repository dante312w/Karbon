import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@karbon/types';

/** Error de regla de negocio con código estable para los clientes (`ApiErrorBody.code`). */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function notFound(what: string): DomainError {
  return new DomainError(ErrorCode.NOT_FOUND, `${what} no existe`, HttpStatus.NOT_FOUND);
}

/** Datos inválidos que las validaciones del DTO no pueden expresar (400, como el ValidationPipe). */
export function badRequest(message: string, details?: unknown): DomainError {
  return new DomainError(ErrorCode.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST, details);
}

export function conflict(code: ErrorCode, message: string, details?: unknown): DomainError {
  return new DomainError(code, message, HttpStatus.CONFLICT, details);
}

/** Regla de negocio incumplida (422) con su código específico. */
export function invalid(code: ErrorCode, message: string, details?: unknown): DomainError {
  return new DomainError(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
}
