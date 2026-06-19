import { createClient } from "@libsql/client";

const client = createClient({ url: "file:./dev.db" });

async function main() {
    console.log("Adding missing columns to AppSettings...");
    
    try {
        await client.execute(`ALTER TABLE "AppSettings" ADD COLUMN "anthropicApiKey" TEXT`);
        console.log("Added anthropicApiKey");
    } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("duplicate column")) {
            console.log("anthropicApiKey already exists");
        } else {
            console.error("Error adding anthropicApiKey:", e instanceof Error ? e.message : e);
        }
    }
    
    try {
        await client.execute(`ALTER TABLE "AppSettings" ADD COLUMN "openRouterApiKey" TEXT`);
        console.log("Added openRouterApiKey");
    } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("duplicate column")) {
            console.log("openRouterApiKey already exists");
        } else {
            console.error("Error adding openRouterApiKey:", e instanceof Error ? e.message : e);
        }
    }
    
    try {
        await client.execute(`ALTER TABLE "AppSettings" ADD COLUMN "nineRouterApiKey" TEXT`);
        console.log("Added nineRouterApiKey");
    } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("duplicate column")) {
            console.log("nineRouterApiKey already exists");
        } else {
            console.error("Error adding nineRouterApiKey:", e instanceof Error ? e.message : e);
        }
    }

    const cols = await client.execute("PRAGMA table_info(AppSettings)");
    console.log("Final AppSettings columns:", cols.rows.map(r => r[1]));
}

main().catch(console.error).finally(() => client.close());
