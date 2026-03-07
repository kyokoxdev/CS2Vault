import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Prevent multiple Prisma Client instances in development (hot reload)
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    // Use Turso (libSQL) in production, local SQLite file in development
    const tursoUrl = process.env.TURSO_DATABASE_URL;

    const adapter = tursoUrl
        ? new PrismaLibSql({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
        : new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./dev.db" });

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

