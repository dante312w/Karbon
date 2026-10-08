import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';

/** Cliente de base de datos: el servicio o una transacción interactiva en curso. */
export type Db = PrismaService | Prisma.TransactionClient;

export type Tx = Prisma.TransactionClient;
