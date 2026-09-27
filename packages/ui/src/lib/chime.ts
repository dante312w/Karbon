let context: AudioContext | null = null;

/**
 * Aviso sonoro corto generado con Web Audio (sin archivos de audio). Dos tonos para comandas
 * nuevas; uno grave para anulaciones.
 */
export function playChime(kind: 'new' | 'alert' = 'new'): void {
  try {
    context ??= new AudioContext();
    const audio = context;
    const notes = kind === 'new' ? [880, 1320] : [330];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + index * 0.18;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.4);
    });
  } catch {
    // Sin audio disponible (política del navegador antes de la primera interacción): se omite.
  }
}
