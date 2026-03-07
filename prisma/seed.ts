/**
 * Database seed script
 * Creates the singleton AppSettings row and any initial data.
 * 
 * Run with: npx prisma db seed
 */

import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

dotenv.config({ path: ".env.local" });
dotenv.config();

const tursoUrl = process.env.TURSO_DATABASE_URL;
const adapter = tursoUrl
    ? new PrismaLibSql({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
    : new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" });

const prisma = new PrismaClient({ adapter });

async function main() {
    // Create singleton AppSettings
    await prisma.appSettings.upsert({
        where: { id: "singleton" },
        update: {},
        create: {
            id: "singleton",
            activeMarketSource: "csfloat",
            activeAIProvider: "gemini-pro",
            syncIntervalMin: 5,
            watchlistOnly: true,
        },
    });

    console.log("✅ AppSettings singleton created");
    console.log("📊 Database seeded successfully");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
