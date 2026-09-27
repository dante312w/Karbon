import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@karbon/types';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { DomainError } from '../errors/domain-error.js';

const MAX_IMAGE_BYTES = 512 * 1024;
const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Archivos del negocio (logo, fotos de productos) en DATA_DIR, fuera de la base de datos. */
@Injectable()
export class StorageService {
  readonly dataDir: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const dataDir = config.get('DATA_DIR', { infer: true });
    this.dataDir = isAbsolute(dataDir) ? dataDir : resolve(process.cwd(), dataDir);
  }

  path(...segments: string[]): string {
    return join(this.dataDir, ...segments);
  }

  /** Guarda una imagen recibida como data URL y devuelve el nombre de archivo relativo. */
  async saveImage(folder: string, baseName: string, dataUrl: string): Promise<string> {
    const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const extension = match?.[1] ? IMAGE_EXTENSIONS[match[1]] : undefined;
    if (!match?.[2] || !extension) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'La imagen debe ser PNG, JPG o WEBP',
        HttpStatus.BAD_REQUEST,
      );
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'La imagen supera 512 KB',
        HttpStatus.BAD_REQUEST,
      );
    }
    const directory = this.path('uploads', folder);
    await mkdir(directory, { recursive: true });
    const fileName = `${baseName}.${extension}`;
    await Promise.all(
      Object.values(IMAGE_EXTENSIONS)
        .filter((other) => other !== extension)
        .map((other) => rm(join(directory, `${baseName}.${other}`), { force: true })),
    );
    await writeFile(join(directory, fileName), bytes);
    return `${folder}/${fileName}`;
  }

  uploadPath(relative: string): string {
    return this.path('uploads', relative);
  }
}
