import { type ChildProcess, spawn } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerPaths } from './paths';

const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 60_000;

/**
 * El backend NestJS corre como proceso hijo con el propio Node de Electron
 * (ELECTRON_RUN_AS_NODE): un fallo del servidor no cierra la caja y se reinicia solo.
 */
export class BackendProcess {
  private child: ChildProcess | null = null;
  private stopping = false;
  private restarts: number[] = [];
  private log: WriteStream | null = null;

  constructor(
    private readonly paths: ServerPaths,
    private readonly onCrash: (message: string) => void,
  ) {}

  async start(env: Record<string, string>): Promise<void> {
    this.stopping = false;
    await mkdir(this.paths.logsDir, { recursive: true });
    this.log ??= createWriteStream(join(this.paths.logsDir, 'server.log'), { flags: 'a' });
    this.spawn(env);
  }

  private spawn(env: Record<string, string>): void {
    const child = spawn(process.execPath, [join(this.paths.serverDir, 'dist', 'main.js')], {
      cwd: this.paths.serverDir,
      env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (this.log) {
      child.stdout.pipe(this.log, { end: false });
      child.stderr.pipe(this.log, { end: false });
    }
    child.once('exit', (code) => {
      this.child = null;
      if (this.stopping) return;
      const now = Date.now();
      this.restarts = [...this.restarts.filter((time) => now - time < RESTART_WINDOW_MS), now];
      if (this.restarts.length > MAX_RESTARTS) {
        this.onCrash(
          `El servidor se detuvo varias veces (código ${String(code)}). Revisa logs/server.log.`,
        );
        return;
      }
      setTimeout(() => {
        if (!this.stopping) this.spawn(env);
      }, 2_000);
    });
    this.child = child;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
  }
}
