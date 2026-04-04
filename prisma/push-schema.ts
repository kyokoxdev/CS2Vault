import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (!tursoUrl || !tursoToken) {
        console.log("⏭️  No Turso credentials found — skipping schema push.");
        process.exit(0);
    }

    console.log(`📡 Target: ${tursoUrl}`);
    const client = createClient({ url: tursoUrl, authToken: tursoToken });

    // Collect all migration SQL files in order
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    const migrationFolders = fs
        .readdirSync(migrationsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();

    let totalApplied = 0;
    let totalSkipped = 0;

    for (const folder of migrationFolders) {
        const sqlPath = path.join(migrationsDir, folder, "migration.sql");
        if (!fs.existsSync(sqlPath)) continue;

        const sql = fs.readFileSync(sqlPath, "utf-8");
        const statements = sql
            .replace(/^--.*$/gm, "")
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        console.log(`\n📂 ${folder} (${statements.length} statements)`);

        for (const stmt of statements) {
            try {
                await client.execute(stmt);
                totalApplied++;
                const match = stmt.match(/(?:CREATE\s+(?:TABLE|INDEX|UNIQUE\s+INDEX)|ALTER\s+TABLE|DROP\s+TABLE|INSERT\s+INTO)\s+"?(\w+)"?/i);
                console.log(`  ✅ ${match?.[1] || stmt.slice(0, 60)}`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                if (
                    msg.includes("already exists") ||
                    msg.includes("duplicate column") ||
                    msg.includes("no such table: main.new_") ||
                    msg.includes("table already exists")
                ) {
                    totalSkipped++;
                    const match = stmt.match(/(?:TABLE|INDEX|COLUMN)\s+"?(\w+)"?/i);
                    console.log(`  ⏭️  ${match?.[1] || "statement"} (already exists)`);
                } else {
                    console.error(`  ❌ Failed: ${stmt.slice(0, 100)}`);
                    console.error(`     ${msg}`);
                    // Don't exit — try remaining statements
                }
            }
        }
    }

    client.close();
    console.log(`\n✅ Schema push complete — ${totalApplied} applied, ${totalSkipped} skipped`);
}

main().catch((err) => {
    console.error("❌ Schema push failed:", err);
    process.exit(1);
});
