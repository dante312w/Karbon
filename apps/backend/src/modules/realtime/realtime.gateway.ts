import { Logger } from '@nestjs/common';
import { type OnGatewayConnection, type OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { ClientToServerEvents, ServerToClientEvents } from '@karbon/types';
import type { Socket } from 'socket.io';
import { extractBearerToken } from '../../common/auth/auth.guard.js';
import { TokenService } from '../auth/token.service.js';
import { EventsService, type KarbonServer } from './events.service.js';
import { roomsFor } from './rooms.js';

type KarbonSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Canal de notificaciones. Autentica en el handshake y une el socket a sus salas. */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly events: EventsService,
  ) {}

  afterInit(server: KarbonServer): void {
    this.events.attach(server);
  }

  async handleConnection(socket: KarbonSocket): Promise<void> {
    const auth = socket.handshake.auth as { token?: unknown };
    const token =
      typeof auth.token === 'string'
        ? auth.token
        : extractBearerToken(socket.handshake.headers.authorization);
    try {
      if (!token) throw new Error('sin token');
      const user = this.tokens.verifyAccessToken(token);
      await socket.join(roomsFor(user));
    } catch {
      this.logger.debug(`Socket rechazado desde ${socket.handshake.address}`);
      socket.disconnect(true);
    }
  }
}
