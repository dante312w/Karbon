import type { AuthUser, LoginResponse } from '@karbon/types';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms en que vence el access token. */
  expiresAt: number;
  user: AuthUser;
}

export interface SessionStore {
  get: () => StoredSession | null;
  set: (session: StoredSession | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function toStoredSession(response: LoginResponse): StoredSession {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: Date.now() + response.expiresIn * 1000,
    user: response.user,
  };
}

function isStoredSession(value: unknown): value is StoredSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accessToken' in value &&
    'refreshToken' in value &&
    'user' in value
  );
}

/**
 * Sesión del dispositivo en localStorage (sobrevive recargas) con respaldo en memoria si el
 * almacenamiento está bloqueado. Se sincroniza entre pestañas con el evento `storage`.
 */
export function createLocalSessionStore(key: string): SessionStore {
  const listeners = new Set<() => void>();
  let memory: StoredSession | null = null;

  const read = (): StoredSession | null => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return memory;
      const parsed: unknown = JSON.parse(raw);
      return isStoredSession(parsed) ? parsed : null;
    } catch {
      return memory;
    }
  };

  let current = read();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  window.addEventListener('storage', (event) => {
    if (event.key === key) {
      current = read();
      notify();
    }
  });

  return {
    get: () => current,
    set: (session) => {
      current = session;
      memory = session;
      try {
        if (session) window.localStorage.setItem(key, JSON.stringify(session));
        else window.localStorage.removeItem(key);
      } catch {
        // Sin almacenamiento persistente: la sesión dura lo que dure la pestaña.
      }
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Almacén en memoria (pruebas, ventanas efímeras). */
export function createMemorySessionStore(initial: StoredSession | null = null): SessionStore {
  const listeners = new Set<() => void>();
  let current = initial;
  return {
    get: () => current,
    set: (session) => {
      current = session;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
