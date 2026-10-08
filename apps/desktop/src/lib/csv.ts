type Cell = string | number | null;

/** Marca de orden de bytes: Excel la necesita para leer UTF-8. */
const BOM = String.fromCharCode(0xfeff);

function escapeCell(value: Cell): string {
  const text = value === null ? '' : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV con `;` y BOM: Excel en español lo abre con columnas y tildes correctas. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return `${BOM}${[headers, ...rows].map((row) => row.map(escapeCell).join(';')).join('\r\n')}`;
}

export function downloadCsv(fileName: string, headers: string[], rows: Cell[][]): void {
  const url = URL.createObjectURL(
    new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
