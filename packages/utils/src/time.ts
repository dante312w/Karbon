/** Hora del día en formato local: "3:12 p. m.". */
export function formatTime(iso: string, locale = 'es-CO'): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** Tiempo transcurrido desde `iso` en texto corto: "5 min", "1 h 20 min". */
export function elapsedLabel(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
