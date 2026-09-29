let context: AudioContext | null = null;

const NOTES: Readonly<Record<'new' | 'alert' | 'call', readonly number[]>> = {
  new: [880, 1320],
  alert: [330],
  // Llamados internos: tres tonos, distinto de "comanda lista" para reconocerlo sin mirar.
  call: [1047, 1319, 1047],
};

/**
 * Aviso sonoro corto generado con Web Audio (sin archivos de audio). Dos tonos para comandas
 * nuevas, uno grave para anulaciones y tres para llamados del equipo.
 */
export function playChime(kind: keyof typeof NOTES = 'new'): void {
  try {
    context ??= new AudioContext();
    const audio = context;
    // Suspendido (o "interrumpido" en iOS tras pasar a segundo plano): se intenta reanudar.
    if (audio.state !== 'running') void audio.resume();
    const notes = NOTES[kind];
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

/**
 * iOS (Safari y la PWA instalada) solo deja sonar audio que se crea o reanuda dentro de un toque,
 * y lo vuelve a suspender al pasar a segundo plano. Cada toque, si hace falta, lo reanuda con un
 * sonido silencioso: así los avisos de cocina y los llamados suenan aunque lleguen sin tocar nada.
 */
export function unlockAudioOnGesture(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const unlock = (): void => {
    try {
      context ??= new AudioContext();
      if (context.state === 'running') return;
      void context.resume();
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, 22_050);
      source.connect(context.destination);
      source.start(0);
    } catch {
      // Navegador sin Web Audio: no hay nada que desbloquear.
    }
  };
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  for (const event of events) target.addEventListener(event, unlock, { passive: true });
  return () => {
    for (const event of events) target.removeEventListener(event, unlock);
  };
}
