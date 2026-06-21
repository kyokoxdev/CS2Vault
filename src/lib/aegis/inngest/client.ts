import { Inngest } from "inngest";
import { prisma } from "@/lib/db";
import { decryptApiKey } from "@/lib/auth/api-keys";

export const inngest = new Inngest({ id: "cs2vault" });

export async function initInngestClient() {
    try {
        const settings = await prisma.appSettings.findUnique({
            where: { id: "singleton" },
        });
        if (settings) {
            const eventKey = decryptApiKey(settings.inngestEventKey) || process.env.INNGEST_EVENT_KEY;
            const signingKey = decryptApiKey(settings.inngestSigningKey) || process.env.INNGEST_SIGNING_KEY;
            
            inngest.setEnvVars({
                INNGEST_EVENT_KEY: eventKey || undefined,
                INNGEST_SIGNING_KEY: signingKey || undefined,
            });
        }
    } catch (err) {
        console.error("[Inngest Client] Failed to load keys from DB settings:", err);
    }
}
