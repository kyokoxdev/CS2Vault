/**
 * Database seed script
 * Creates the singleton AppSettings row and any initial data.
 * 
 * Run with: npx prisma db seed
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

async function main() {
    // Create singleton AppSettings
    await prisma.appSettings.upsert({
        where: { id: "singleton" },
        update: {},
        create: {
            id: "singleton",
            activeMarketSource: "pricempire",
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
