import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { type ApiErrorBody, ErrorCode } from '@karbon/types';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client.js';
import { DomainError } from './domain-error.js';

interface DescribedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

function describeHttpException(exception: HttpException): DescribedError {
  const status = exception.getStatus();
  const response = exception.getResponse();
  let message = exception.message;
  let details: unknown;
  let code = CODE_BY_STATUS[status] ?? ErrorCode.INTERNAL_ERROR;

  if (typeof response === 'object' && 'message' in response) {
    const raw = response.message;
    if (Array.isArray(raw)) {
      // ValidationPipe devuelve una lista de mensajes por campo.
      details = raw;
      message = 'Los datos enviados no son válidos';
    } else if (typeof raw === 'string') {
      message = raw;
    }
    if ('code' in response && typeof response.code === 'string') {
      code = response.code as ErrorCode;
    }
  }
  return { status, code, message, details };
}

function describePrismaError(error: Prisma.PrismaClientKnownRequestError): DescribedError | null {
  switch (error.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'Ya existe un registro con ese valor',
        details: error.meta,
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'El registro está relacionado con otros datos',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
        message: 'El registro no existe',
      };
    default:
      return null;
  }
}

/** Todas las respuestas de error de la API siguen `ApiErrorBody`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const described = this.describe(exception);
    if (described.status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl}: ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`,
      );
    }

    const requestId = request.headers['x-request-id'];
    const body: ApiErrorBody = {
      statusCode: described.status,
      error: STATUS_CODES[described.status] ?? 'Error',
      message: described.message,
      code: described.code,
      ...(described.details === undefined ? {} : { details: described.details }),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      ...(typeof requestId === 'string' ? { requestId } : {}),
    };
    response.status(described.status).json(body);
  }

  private describe(exception: unknown): DescribedError {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCode.RATE_LIMITED,
        message: 'Demasiadas solicitudes; intenta de nuevo en un momento',
      };
    }
    if (exception instanceof HttpException) return describeHttpException(exception);
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const described = describePrismaError(exception);
      if (described) return described;
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Error interno del servidor',
    };
  }
}
