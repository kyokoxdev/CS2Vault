import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = createClient({ 
    url: process.env.TURSO_DATABASE_URL!, 
    authToken: process.env.TURSO_AUTH_TOKEN 
});

async function main() {
    console.log("Fixing Turso DB...");

    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tableNames = tables.rows.map(r => r[0]);
    
    if (tableNames.includes('new_Item') && !tableNames.includes('Item')) {
        console.log("Renaming new_Item to Item...");
        await client.execute('ALTER TABLE "new_Item" RENAME TO "Item"');
        console.log("Renamed new_Item to Item.");
    }

    const itemCount = await client.execute("SELECT COUNT(*) FROM Item WHERE isActive=1");
    console.log("Active item count:", itemCount.rows[0]);

    // Re-create the unique index if missing
    try {
      await client.execute(`CREATE UNIQUE INDEX "Item_marketHashName_key" ON "Item"("marketHashName")`);
      console.log("Created index Item_marketHashName_key");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.log("Index Item_marketHashName_key might already exist", message);
    }
}

main().catch(console.error).finally(() => client.close());
