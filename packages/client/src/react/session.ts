import type { LoginResponse, Permission } from '@karbon/types';
import { canDeliverOrder, canManageOrder } from '@karbon/utils';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { type StoredSession, toStoredSession } from '../session-store';
import { useKarbon } from './context';

export function useSession(): StoredSession | null {
  const { sessions } = useKarbon();
  return useSyncExternalStore(sessions.subscribe, sessions.get, sessions.get);
}

export function useHasPermission(permission: Permission): boolean {
  return useSession()?.user.permissions.includes(permission) ?? false;
}

/**
 * Propiedad del pedido para el usuario de la sesión: las pantallas solo ofrecen lo que el
 * servidor aceptaría (la regla es la misma, `canManageOrder`).
 */
export function useOrderAccess(): {
  canManage: (waiterId: string) => boolean;
  canDeliver: (waiterId: string) => boolean;
} {
  const user = useSession()?.user;
  return useMemo(
    () => ({
      canManage: (waiterId: string) => user !== undefined && canManageOrder(user, waiterId),
      canDeliver: (waiterId: string) => user !== undefined && canDeliverOrder(user, waiterId),
    }),
    [user],
  );
}

export function useAuthActions() {
  const { api, sessions, http } = useKarbon();

  const start = useCallback(
    (response: LoginResponse): StoredSession => {
      const session = toStoredSession(response);
      sessions.set(session);
      return session;
    },
    [sessions],
  );

  const loginWithPassword = useCallback(
    async (username: string, password: string, deviceName?: string) =>
      start(await api.auth.login({ username, password, ...(deviceName ? { deviceName } : {}) })),
    [api, start],
  );

  const loginWithPin = useCallback(
    async (userId: string, pin: string, deviceName?: string) =>
      start(await api.auth.pinLogin({ userId, pin, ...(deviceName ? { deviceName } : {}) })),
    [api, start],
  );

  const logout = useCallback(async () => {
    const current = sessions.get();
    sessions.set(null);
    if (current) {
      try {
        await api.auth.logout(current.refreshToken);
      } catch {
        // Sin red: la sesión local ya se cerró; el token vence solo.
      }
    }
  }, [api, sessions]);

  return { loginWithPassword, loginWithPin, logout, start, refresh: () => http.refresh() };
}
