/** Texto comparable sin mayúsculas ni tildes: "Limonada" coincide con "limonáda". */
export function normalizeSearch(text: string): string {
  return text
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
