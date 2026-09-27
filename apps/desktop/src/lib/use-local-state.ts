import { useState } from 'react';

/** Preferencia de la terminal (estación del KDS, sonido…) guardada en este equipo. */
export function useLocalState<T extends string | boolean>(
  key: string,
  initial: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (stored === null) return initial;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return initial;
    }
  });
  const update = (next: T): void => {
    localStorage.setItem(key, JSON.stringify(next));
    setValue(next);
  };
  return [value, update];
}
