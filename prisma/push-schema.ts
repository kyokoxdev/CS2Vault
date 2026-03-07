/**
 * Prisma CLI doesn't support libsql:// URLs — this script generates SQL via
 * `prisma migrate diff` and executes it against Turso via @libsql/client.
 *
 * Usage: npx tsx prisma/push-schema.ts
 */

import dotenv from "dotenv";
import { execSync } from "child_process";
import { createClient } from "@libsql/client";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (!tursoUrl || !tursoToken) {
        console.error(
            "❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.\n" +
            "   Export them in your shell or add to .env.local"
        );
        process.exit(1);
    }

    console.log(`📡 Target: ${tursoUrl}`);
    console.log("🔧 Generating SQL from Prisma schema...");

    const sql = execSync(
        "npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script",
        { encoding: "utf-8", timeout: 30_000 }
    ).trim();

    if (!sql) {
        console.error("❌ No SQL generated from prisma migrate diff");
        process.exit(1);
    }

    const sqlNoComments = sql.replace(/^--.*$/gm, "");
    const statements = sqlNoComments
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    console.log(`📝 ${statements.length} statements to execute`);

    const client = createClient({ url: tursoUrl, authToken: tursoToken });
    let created = 0;
    let skipped = 0;

    for (const stmt of statements) {
        try {
            await client.execute(stmt);
            created++;
            const match = stmt.match(/(?:TABLE|INDEX)\s+"?(\w+)"?/i);
            if (match) console.log(`  ✅ ${match[1]}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("already exists")) {
                skipped++;
                const match = stmt.match(/(?:TABLE|INDEX)\s+"?(\w+)"?/i);
                if (match) console.log(`  ⏭️  ${match[1]} (already exists)`);
            } else {
                console.error(`  ❌ Failed: ${stmt.slice(0, 80)}...`);
                console.error(`     ${msg}`);
                process.exit(1);
            }
        }
    }

    client.close();
    console.log(`\n✅ Schema push complete — ${created} created, ${skipped} skipped (already exist)`);
}

main().catch((err) => {
    console.error("❌ Schema push failed:", err);
    process.exit(1);
});
