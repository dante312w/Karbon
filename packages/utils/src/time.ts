/** Tiempo transcurrido desde `iso` en texto corto: "5 min", "1 h 20 min". */
export function elapsedLabel(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
