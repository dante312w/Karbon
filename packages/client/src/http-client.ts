import type { ApiErrorBody, ErrorCode, LoginResponse } from '@karbon/types';
import { type SessionStore, type StoredSession, toStoredSession } from './session-store';

/** Error de la API con código estable (`ErrorCode`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static is(error: unknown, code?: ErrorCode): error is ApiError {
    return error instanceof ApiError && (code === undefined || error.code === code);
  }
}

/** El servidor no respondió (sin red o servidor caído): la operación puede reintentarse. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Sin conexión con el servidor', { cause });
    this.name = 'NetworkError';
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** `false` para rutas públicas (ingreso, salud). */
  auth?: boolean;
}

const REFRESH_MARGIN_MS = 30_000;
const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
const TIMEOUT_MS = 15_000;

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'statusCode' in value && 'message' in value;
}

export function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value as string | number | boolean));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

/**
 * Cliente HTTP de la API. Renueva el access token antes de que venza y ante un 401, con una
 * sola renovación en vuelo aunque varias solicitudes fallen a la vez (el refresh token rota).
 */
export class HttpClient {
  private refreshing: Promise<StoredSession | null> | null = null;

  constructor(
    readonly baseUrl: string,
    readonly sessions: SessionStore,
  ) {}

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body ?? {}, options);
  }

  patch<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  url(path: string): string {
    return `${this.baseUrl}/api/v1${path}`;
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const authenticated = options.auth !== false;
    let session = authenticated ? this.sessions.get() : null;
    if (session && session.expiresAt - Date.now() < REFRESH_MARGIN_MS)
      session = await this.refresh();

    let response = await this.send(method, path, body, options, session?.accessToken);
    if (response.status === 401 && authenticated && session) {
      session = await this.refresh();
      if (session) response = await this.send(method, path, body, options, session.accessToken);
    }
    return this.parse<T>(response);
  }

  /** Renueva la sesión; si el servidor la rechaza, la cierra localmente. */
  refresh(): Promise<StoredSession | null> {
    this.refreshing ??= (async () => {
      const current = this.sessions.get();
      if (!current) return null;
      try {
        const response = await this.send(
          'POST',
          '/auth/refresh',
          { refreshToken: current.refreshToken },
          {},
          undefined,
        );
        if (!response.ok) {
          if (response.status === 401) this.sessions.set(null);
          return response.status === 401 ? null : current;
        }
        const next = toStoredSession((await response.json()) as LoginResponse);
        this.sessions.set(next);
        return next;
      } catch {
        // Sin red: se conserva la sesión para reintentar cuando vuelva la conexión.
        return current;
      }
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async send(
    method: HttpMethod,
    path: string,
    body: unknown,
    options: RequestOptions,
    token: string | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const signals = [AbortSignal.timeout(TIMEOUT_MS), ...(options.signal ? [options.signal] : [])];
    try {
      return await fetch(this.url(path), {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
        signal: AbortSignal.any(signals),
        cache: 'no-store',
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new NetworkError(error);
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    const data = parseJson(await response.text());
    if (!response.ok) {
      if (isErrorBody(data)) {
        throw new ApiError(response.status, data.code ?? 'UNKNOWN', data.message, data.details);
      }
      // Un proxy responde sin el servidor detrás: para la app es lo mismo que no tener red
      // (la operación se puede reintentar y la cola sin conexión la guarda).
      if (GATEWAY_STATUSES.has(response.status))
        throw new NetworkError(new Error(`HTTP ${String(response.status)}`));
      throw new ApiError(response.status, 'UNKNOWN', `Error ${String(response.status)}`);
    }
    return data as T;
  }
}
