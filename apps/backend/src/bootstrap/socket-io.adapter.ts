import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { lanOriginChecker } from './cors.js';

/** Adaptador Socket.io con la misma política CORS de red local que la API REST. */
export class LanSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOriginsSetting: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // IoAdapter completa los valores por defecto de socket.io (path, etc.) sobre estas opciones.
    const merged = {
      ...options,
      cors: { origin: lanOriginChecker(this.corsOriginsSetting) },
      pingInterval: 20_000,
      pingTimeout: 20_000,
    } as ServerOptions;
    return super.createIOServer(port, merged);
  }
}
