import { PrismaClient } from "../../generated/prisma/client.js";
import { isProduction } from "./env.js";

/**
 * A single Prisma client for the whole process. `tsx watch` re-imports modules
 * on every reload, so the instance is cached on `globalThis` to avoid opening a
 * new connection pool each time.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({ log: isProduction ? ["error"] : ["error", "warn"] });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
