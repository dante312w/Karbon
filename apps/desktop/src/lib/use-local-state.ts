import { useState } from 'react';

/**
 * Preferencia de la terminal (estación del KDS, sonido…) guardada en este equipo. Con el
 * almacenamiento bloqueado vive solo mientras la pantalla esté abierta.
 */
export function useLocalState<T extends string | boolean>(
  key: string,
  initial: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  const update = (next: T): void => {
    setValue(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Sin almacenamiento persistente.
    }
  };
  return [value, update];
}
