import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });
dotenv.config();

type LibsqlClient = ReturnType<typeof createClient>;

interface RequiredColumn {
    table: string;
    name: string;
    definition: string;
}

const REQUIRED_COLUMNS: RequiredColumn[] = [
    { table: "Item", name: "isWatched", definition: '"isWatched" BOOLEAN NOT NULL DEFAULT false' },
    { table: "Item", name: "notes", definition: '"notes" TEXT' },
];

function columnName(row: unknown): string | null {
    if (typeof row !== "object" || row === null) {
        return null;
    }

    const value = (row as Record<string, unknown>).name;
    return typeof value === "string" ? value : null;
}

function rowValue(row: unknown, key: string): unknown {
    if (typeof row !== "object" || row === null) {
        return null;
    }

    return (row as Record<string, unknown>)[key];
}

function rowString(row: unknown, key: string): string | null {
    const value = rowValue(row, key);
    return typeof value === "string" ? value : null;
}

function rowNumber(row: unknown, key: string): number {
    const value = rowValue(row, key);
    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "bigint") {
        return Number(value);
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

async function getTableColumns(client: LibsqlClient, tableName: string): Promise<Set<string>> {
    const result = await client.execute(`PRAGMA table_info("${tableName}")`);
    return new Set(result.rows.map(columnName).filter((name): name is string => name !== null));
}

async function repairRequiredColumns(client: LibsqlClient, phase: string): Promise<number> {
    let repaired = 0;

    for (const column of REQUIRED_COLUMNS) {
        const columns = await getTableColumns(client, column.table);
        if (columns.size === 0) {
            continue;
        }

        if (!columns.has(column.name)) {
            await client.execute(`ALTER TABLE "${column.table}" ADD COLUMN ${column.definition}`);
            repaired++;
            console.log(`  🔧 ${phase}: added ${column.table}.${column.name}`);
        }
    }

    return repaired;
}

async function repairLegacyWatchlistItems(client: LibsqlClient, phase: string): Promise<number> {
    const itemColumns = await getTableColumns(client, "Item");
    if (!itemColumns.has("isWatched")) {
        return 0;
    }

    const watchlistItemColumns = await getTableColumns(client, "WatchlistItem");
    if (!watchlistItemColumns.has("itemId")) {
        return 0;
    }

    const pending = await client.execute(`
        SELECT COUNT(DISTINCT "itemId") AS "total"
        FROM "WatchlistItem"
        WHERE "itemId" IN (
            SELECT "id"
            FROM "Item"
            WHERE "isWatched" = false
        )
    `);
    const total = rowNumber(pending.rows[0], "total");
    if (total === 0) {
        return 0;
    }

    await client.execute(`
        UPDATE "Item"
        SET "isWatched" = true
        WHERE "id" IN (SELECT "itemId" FROM "WatchlistItem")
    `);

    console.log(`  🔧 ${phase}: marked ${total} legacy watchlist item${total === 1 ? "" : "s"} as watched`);
    return total;
}

async function assertUniqueWatchlistGroupNames(client: LibsqlClient): Promise<void> {
    const duplicates = await client.execute(`
        SELECT "name", COUNT(*) AS "total"
        FROM "WatchlistGroup"
        GROUP BY "name"
        HAVING COUNT(*) > 1
        LIMIT 5
    `);

    if (duplicates.rows.length > 0) {
        const names = duplicates.rows
            .map((row) => rowString(row, "name") ?? "<unnamed>")
            .join(", ");
        throw new Error(`Cannot repair WatchlistGroup safely: duplicate group names exist (${names}). Rename duplicates before rerunning schema push.`);
    }
}

function selectLegacyGroupColumn(columns: Set<string>, column: string, fallback: string): string {
    return columns.has(column) ? `"${column}"` : fallback;
}

async function createWatchlistGroupNameIndex(client: LibsqlClient): Promise<void> {
    await assertUniqueWatchlistGroupNames(client);
    await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS "WatchlistGroup_name_key" ON "WatchlistGroup"("name")');
}

async function repairWatchlistGroup(client: LibsqlClient, phase: string): Promise<number> {
    const columns = await getTableColumns(client, "WatchlistGroup");
    if (columns.size === 0) {
        return 0;
    }

    let repaired = 0;
    if (columns.has("userId")) {
        await assertUniqueWatchlistGroupNames(client);

        const colorSelect = selectLegacyGroupColumn(columns, "color", "NULL");
        const sortOrderSelect = selectLegacyGroupColumn(columns, "sortOrder", "0");
        const createdAtSelect = selectLegacyGroupColumn(columns, "createdAt", "CURRENT_TIMESTAMP");

        await client.execute("PRAGMA foreign_keys=OFF");
        try {
            await client.execute('DROP TABLE IF EXISTS "new_WatchlistGroup"');
            await client.execute(`
                CREATE TABLE "new_WatchlistGroup" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "color" TEXT,
                    "sortOrder" INTEGER NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await client.execute(`
                INSERT OR IGNORE INTO "new_WatchlistGroup" ("id", "name", "color", "sortOrder", "createdAt")
                SELECT "id", "name", ${colorSelect}, ${sortOrderSelect}, ${createdAtSelect}
                FROM "WatchlistGroup"
            `);
            await client.execute('DROP TABLE "WatchlistGroup"');
            await client.execute('ALTER TABLE "new_WatchlistGroup" RENAME TO "WatchlistGroup"');
        } finally {
            await client.execute("PRAGMA foreign_keys=ON");
        }

        repaired++;
        console.log(`  🔧 ${phase}: rebuilt legacy WatchlistGroup without userId`);
    }

    await createWatchlistGroupNameIndex(client);
    return repaired;
}

async function main() {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (!tursoUrl || !tursoToken) {
        console.log("⏭️  No Turso credentials found — skipping schema push.");
        process.exit(0);
    }

    console.log(`📡 Target: ${tursoUrl}`);
    const client = createClient({ url: tursoUrl, authToken: tursoToken });
    let totalRepaired = await repairRequiredColumns(client, "pre-migration repair");
    totalRepaired += await repairLegacyWatchlistItems(client, "pre-migration repair");
    totalRepaired += await repairWatchlistGroup(client, "pre-migration repair");

    // Collect all migration SQL files in order
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    const migrationFolders = fs
        .readdirSync(migrationsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();

    let totalApplied = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

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
                    totalFailed++;
                    console.error(`  ❌ Failed: ${stmt.slice(0, 100)}`);
                    console.error(`     ${msg}`);
                }
            }
        }
    }

    totalRepaired += await repairRequiredColumns(client, "post-migration repair");
    totalRepaired += await repairLegacyWatchlistItems(client, "post-migration repair");
    totalRepaired += await repairWatchlistGroup(client, "post-migration repair");

    client.close();
    if (totalFailed > 0) {
        throw new Error(`Schema push finished with ${totalFailed} failed migration statement${totalFailed === 1 ? "" : "s"}.`);
    }

    console.log(`\n✅ Schema push complete — ${totalApplied} applied, ${totalSkipped} skipped, ${totalRepaired} repaired`);
}

main().catch((err) => {
    console.error("❌ Schema push failed:", err);
    process.exit(1);
});
