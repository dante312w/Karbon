import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Consultas que se guardan en el equipo para poder tomar pedidos aunque la app se recargue sin
 * red: catálogo, mesas y configuración. Los pedidos no se guardan: siempre vienen en vivo.
 */
const PERSISTED_ROOTS: ReadonlySet<string> = new Set([
  'settings',
  'categories',
  'products',
  'areas',
  'tables',
]);
const SAVE_DELAY_MS = 1_000;

interface PersistedEntry {
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
}

function isPersisted(queryKey: QueryKey): boolean {
  return queryKey.length === 1 && PERSISTED_ROOTS.has(String(queryKey[0]));
}

/**
 * Con el almacenamiento bloqueado (modo privado, políticas del navegador) la caché simplemente
 * no se guarda: la app sigue funcionando en línea.
 */
function withStorage<T>(action: (storage: Storage) => T, fallback: T): T {
  try {
    return action(window.localStorage);
  } catch {
    return fallback;
  }
}

/** Carga la caché guardada antes del primer render (sin parpadeo de "cargando"). */
export function hydrateCache(queryClient: QueryClient, storageKey: string): void {
  const raw = withStorage((storage) => storage.getItem(storageKey), null);
  if (!raw) return;
  try {
    for (const entry of JSON.parse(raw) as PersistedEntry[]) {
      if (isPersisted(entry.queryKey))
        queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.updatedAt });
    }
  } catch {
    clearPersistedCache(storageKey);
  }
}

/** Guarda (con retardo) cada vez que cambia una de las consultas persistidas. */
export function persistCache(queryClient: QueryClient, storageKey: string): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = (): void => {
    const entries: PersistedEntry[] = queryClient
      .getQueryCache()
      .findAll()
      .filter((query) => isPersisted(query.queryKey) && query.state.data !== undefined)
      .map((query) => ({
        queryKey: query.queryKey,
        data: query.state.data,
        updatedAt: query.state.dataUpdatedAt,
      }));
    withStorage((storage) => {
      storage.setItem(storageKey, JSON.stringify(entries));
    }, undefined);
  };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // El evento tipa la consulta de forma genérica; solo se usa su clave.
    const { queryKey } = event.query as { queryKey: QueryKey };
    if (event.type !== 'updated' || !isPersisted(queryKey)) return;
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

export function clearPersistedCache(storageKey: string): void {
  withStorage((storage) => {
    storage.removeItem(storageKey);
  }, undefined);
}

/**
 * Borra las cachés que guardaron otras versiones de la app: tras una actualización los datos
 * pueden tener otra forma (p. ej. un campo nuevo) y la pantalla fallaría antes de refrescarlos.
 */
export function discardStaleCaches(prefix: string, current: string): void {
  withStorage((storage) => {
    for (const key of Object.keys(storage)) {
      if (key.startsWith(prefix) && key !== current) storage.removeItem(key);
    }
  }, undefined);
}
