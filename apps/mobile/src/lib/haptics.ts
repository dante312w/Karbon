/** Vibración corta de confirmación. Safari en iPhone no la soporta: ahí no hace nada. */
export function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}
