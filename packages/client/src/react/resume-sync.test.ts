import { describe, expect, it, vi } from 'vitest';
import { bindResumeSync, RESUME_AFTER_MS } from './realtime';

function setup({ connected = true, session = true } = {}) {
  const visibility: { visibilityState: DocumentVisibilityState } = { visibilityState: 'visible' };
  const doc = Object.assign(new EventTarget(), visibility);
  const win = new EventTarget();
  let clock = 0;
  const socket = { connected, connect: vi.fn(), disconnect: vi.fn() };
  const queryClient = { invalidateQueries: vi.fn(() => Promise.resolve()) };
  const unbind = bindResumeSync({
    socket: socket,
    queryClient: queryClient as never,
    hasSession: () => session,
    doc,
    win,
    now: () => clock,
  });
  const hide = (): void => {
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  const show = (afterMs: number): void => {
    clock += afterMs;
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { socket, queryClient, win, hide, show, unbind };
}

describe('bindResumeSync (iOS suspende la app)', () => {
  it('al volver tras un rato reconecta el socket y recarga el estado', () => {
    const { socket, queryClient, hide, show } = setup();
    hide();
    show(RESUME_AFTER_MS + 1);
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.connect).toHaveBeenCalledOnce();
    expect(queryClient.invalidateQueries).toHaveBeenCalledOnce();
  });

  it('un vistazo corto con el socket conectado no recarga nada', () => {
    const { socket, hide, show } = setup();
    hide();
    show(2_000);
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('si el socket se cayó, reconecta aunque haya sido un momento', () => {
    const { socket, hide, show } = setup({ connected: false });
    hide();
    show(1_000);
    expect(socket.connect).toHaveBeenCalledOnce();
  });

  it('al recuperar la red (cambio de Wi-Fi) reconecta si estaba desconectado', () => {
    const { socket, win } = setup({ connected: false });
    win.dispatchEvent(new Event('online'));
    expect(socket.connect).toHaveBeenCalledOnce();
  });

  it('sin sesión no intenta conectar, y al desmontar deja de escuchar', () => {
    const { socket, hide, show, unbind } = setup({ session: false });
    hide();
    show(RESUME_AFTER_MS * 2);
    expect(socket.connect).not.toHaveBeenCalled();
    unbind();
  });
});
