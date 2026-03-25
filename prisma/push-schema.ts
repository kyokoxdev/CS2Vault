import dotenv from "dotenv";
import { execSync, spawnSync } from "child_process";
import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

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
    const client = createClient({ url: tursoUrl, authToken: tursoToken });

    const tempDbPath = path.join(process.cwd(), "prisma", ".turso-shadow.db");
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

    console.log("📥 Dumping current Turso schema to shadow DB...");
    const tables = await client.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'"
    );
    const indexes = await client.execute(
        "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
    );

    const shadowClient = createClient({ url: `file:${tempDbPath}` });
    for (const row of tables.rows) {
        if (row.sql) await shadowClient.execute(row.sql as string);
    }
    for (const row of indexes.rows) {
        if (row.sql) {
            try { await shadowClient.execute(row.sql as string); } catch { /* ignore */ }
        }
    }
    shadowClient.close();

    console.log("🔧 Generating migration diff...");
    const diffResult = spawnSync(
        "npx",
        ["prisma", "migrate", "diff", "--from-url", `file:${tempDbPath}`, "--to-schema", "prisma/schema.prisma", "--script"],
        { encoding: "utf-8", timeout: 30_000, shell: true }
    );

    if (diffResult.error) {
        console.error("❌ Failed to run prisma migrate diff:", diffResult.error);
        process.exit(1);
    }

    const sql = (diffResult.stdout || "").trim();
    
    try { fs.unlinkSync(tempDbPath); } catch { /* Windows file lock - ignore */ }
    try { fs.unlinkSync(tempDbPath + "-journal"); } catch { /* may not exist */ }

    if (!sql || sql === "-- This is an empty migration.") {
        console.log("\n✅ Schema already in sync — nothing to do.");
        client.close();
        return;
    }

    const sqlNoComments = sql.replace(/^--.*$/gm, "");
    const statements = sqlNoComments
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    console.log(`📝 ${statements.length} statements to execute`);

    let applied = 0;
    let skipped = 0;

    for (const stmt of statements) {
        try {
            await client.execute(stmt);
            applied++;
            const match = stmt.match(/(?:TABLE|INDEX|COLUMN)\s+"?(\w+)"?/i);
            console.log(`  ✅ ${match?.[1] || stmt.slice(0, 50)}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("already exists") || msg.includes("duplicate column")) {
                skipped++;
                const match = stmt.match(/(?:TABLE|INDEX|COLUMN)\s+"?(\w+)"?/i);
                console.log(`  ⏭️  ${match?.[1] || "statement"} (already exists)`);
            } else {
                console.error(`  ❌ Failed: ${stmt.slice(0, 80)}...`);
                console.error(`     ${msg}`);
                process.exit(1);
            }
        }
    }

    client.close();
    console.log(`\n✅ Schema push complete — ${applied} applied, ${skipped} skipped`);
}

main().catch((err) => {
    console.error("❌ Schema push failed:", err);
    process.exit(1);
});
