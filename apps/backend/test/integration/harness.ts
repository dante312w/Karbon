import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  EventEnvelope,
  LoginResponse,
  ServerToClientEvents,
  SocketEvent,
  SocketEventMap,
} from '@karbon/types';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap/configure-app.js';

export interface Harness {
  app: NestExpressApplication;
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startApp(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return { app, baseUrl, close: () => app.close() };
}

/** Cliente HTTP autenticado con un usuario del seed. */
export class ApiClient {
  constructor(
    private readonly harness: Harness,
    readonly session: LoginResponse,
  ) {}

  private http() {
    return request(this.harness.app.getHttpServer());
  }

  get(path: string) {
    return this.http()
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${this.session.accessToken}`);
  }

  post(path: string, body: object = {}, headers: Record<string, string> = {}) {
    return this.http()
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${this.session.accessToken}`)
      .set(headers)
      .send(body);
  }

  patch(path: string, body: object) {
    return this.http()
      .patch(`/api/v1${path}`)
      .set('Authorization', `Bearer ${this.session.accessToken}`)
      .send(body);
  }

  put(path: string, body: object) {
    return this.http()
      .put(`/api/v1${path}`)
      .set('Authorization', `Bearer ${this.session.accessToken}`)
      .send(body);
  }
}

export async function loginWithPassword(
  harness: Harness,
  username: string,
  password: string,
): Promise<ApiClient> {
  const response = await request(harness.app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(200);
  return new ApiClient(harness, response.body as LoginResponse);
}

export async function loginWithPin(
  harness: Harness,
  username: string,
  pin: string,
): Promise<ApiClient> {
  const server = harness.app.getHttpServer();
  const users = await request(server).get('/api/v1/auth/pin-users').expect(200);
  const user = (users.body as { id: string; name: string }[]).find((candidate) =>
    candidate.name.toLowerCase().includes(username.toLowerCase()),
  );
  if (!user) throw new Error(`Usuario con PIN ${username} no encontrado`);
  const response = await request(server)
    .post('/api/v1/auth/pin-login')
    .send({ userId: user.id, pin })
    .expect(200);
  return new ApiClient(harness, response.body as LoginResponse);
}

/** Socket autenticado que acumula los eventos recibidos para poder esperarlos. */
export class EventProbe {
  private readonly received: { event: string; envelope: EventEnvelope<unknown> }[] = [];
  readonly socket: Socket<ServerToClientEvents>;

  constructor(harness: Harness, token: string) {
    this.socket = io(harness.baseUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    this.socket.onAny((event: string, envelope: EventEnvelope<unknown>) => {
      this.received.push({ event, envelope });
    });
  }

  connected(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) {
        resolve();
        return;
      }
      this.socket.once('connect', () => {
        resolve();
      });
      this.socket.once('connect_error', reject);
    });
  }

  async waitFor<E extends SocketEvent>(
    event: E,
    predicate: (data: SocketEventMap[E]) => boolean = () => true,
    timeoutMs = 5_000,
  ): Promise<SocketEventMap[E]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const match = this.received.find(
        (entry) => entry.event === event && predicate(entry.envelope.data as SocketEventMap[E]),
      );
      if (match) return match.envelope.data as SocketEventMap[E];
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`No llegó el evento ${event}`);
  }

  has(event: SocketEvent): boolean {
    return this.received.some((entry) => entry.event === event);
  }

  close(): void {
    this.socket.close();
  }
}
