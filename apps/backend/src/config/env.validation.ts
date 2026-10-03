import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const NODE_ENVS = ['development', 'production', 'test'] as const;
const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

const toBoolean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() === 'true' : value;

/** Variables de entorno validadas al arrancar: una configuración inválida detiene el servidor. */
export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv = 'development';

  @IsString()
  HOST = '0.0.0.0';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 3000;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'log';

  @IsString()
  @Matches(/^postgres(ql)?:\/\/.+/, { message: 'DATABASE_URL debe ser una URL de PostgreSQL' })
  DATABASE_URL!: string;

  @IsString()
  CORS_ORIGINS = '';

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET debe tener al menos 32 caracteres' })
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL_SECONDS = 900;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  JWT_REFRESH_TTL_DAYS = 30;

  /** Carpeta de datos: imágenes subidas, respaldos, certificados. */
  @IsString()
  DATA_DIR = './data';

  /** Builds de la PWA y del renderer de escritorio a servir (vacío = no se sirven). */
  @IsString()
  CLIENT_MOBILE_DIR = '';

  @IsString()
  CLIENT_DESKTOP_DIR = '';

  /** Binarios de PostgreSQL (pg_dump / pg_restore) para respaldos. Vacío = usa el PATH. */
  @IsString()
  PG_BIN_DIR = '';

  /**
   * Carpeta de migraciones a aplicar al arrancar (instalación de escritorio, sin la CLI de
   * Prisma). Vacío = no se migra al arrancar (desarrollo y Docker usan `prisma migrate`).
   */
  @IsString()
  MIGRATIONS_DIR = '';

  /** Puerto HTTPS con la CA local (0 = deshabilitado). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65_535)
  HTTPS_PORT = 0;

  /**
   * Solo desarrollo: puertos de Vite de la app de meseros y del escritorio, para que
   * Configuración → Celulares muestre direcciones que abren desde un celular (0 = no aplica).
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65_535)
  DEV_MOBILE_PORT = 0;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65_535)
  DEV_DESKTOP_PORT = 0;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .map((message) => `  - ${message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  return env;
}
