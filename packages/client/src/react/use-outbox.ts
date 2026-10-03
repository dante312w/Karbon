import { useCallback, useEffect, useState } from 'react';
import { Outbox, type OutboxEntry } from '../offline/outbox';
import { useKarbon } from './context';

let shared: Outbox | null = null;

/** Cola offline de la terminal: estado, reenvío automático al volver la red y descarte manual. */
export function useOutbox() {
  const { api, socket } = useKarbon();
  const [outbox] = useState(() => (shared ??= new Outbox()));
  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  const refresh = useCallback(() => {
    void outbox.list().then(setEntries);
  }, [outbox]);

  const flush = useCallback(() => outbox.flush(api), [outbox, api]);

  useEffect(() => {
    refresh();
    const unsubscribe = outbox.subscribe(refresh);
    const retry = (): void => {
      void flush();
    };
    window.addEventListener('online', retry);
    socket.on('connect', retry);
    const timer = window.setInterval(retry, 15_000);
    return () => {
      unsubscribe();
      window.removeEventListener('online', retry);
      socket.off('connect', retry);
      window.clearInterval(timer);
    };
  }, [outbox, refresh, flush, socket]);

  return {
    outbox,
    entries,
    pending: entries.filter((entry) => !entry.failed),
    failed: entries.filter((entry) => entry.failed),
    flush,
    discard: (id: string) => outbox.remove(id),
  };
}
