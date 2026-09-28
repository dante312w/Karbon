import { useEffect, useState } from 'react';

/**
 * Hora actual que se refresca cada `intervalMs`: cronómetros de mesas y comandas. Con
 * `running = false` no hay intervalo (p. ej. todas las comandas ya entregadas): la hora queda
 * fija y la pantalla no se vuelve a dibujar por el reloj.
 */
export function useNow(intervalMs = 30_000, running = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs, running]);
  return now;
}
