import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { z } from "zod/v4";

// Zod schema for settings validation
const settingsSchema = z.object({
    activeMarketSource: z.enum(["pricempire", "csfloat", "csgotrader", "steam"]).optional(),
    csgotraderSubProvider: z.enum(["csgotrader", "bitskins", "steam", "csmoney", "csgotm", "lootfarm", "skinport", "csgoempire", "swapgg", "buff163", "cstrade", "csfloat", "youpin", "lisskins"]).optional(),
    activeAIProvider: z.enum(["gemini-pro", "gemini-flash", "openai"]).optional(),
    syncIntervalMin: z.number().int().min(1).max(1440).optional(),
    openAiApiKey: z.string().max(256).optional(),
    geminiApiKey: z.string().max(256).optional(),
    csfloatApiKey: z.string().max(256).optional(),
});

function maskApiKey(key: string | null | undefined): string {
    if (!key || key.length < 8) return "";
    const prefix = key.slice(0, 4);
    const suffix = key.slice(-4);
    return `${prefix}...${suffix}`;
}

export async function GET() {
    const session = await auth();
    let userId: string | undefined;

    if (session?.user?.id) {
        userId = session.user.id;
    } else if (process.env.NODE_ENV === "development") {
        const firstUser = await prisma.user.findFirst();
        if (firstUser) userId = firstUser.id;
    }

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const settings = await prisma.appSettings.findUnique({
            where: { id: "singleton" },
        });

        if (!settings) {
            // Return defaults if not created yet
            return NextResponse.json({
                activeMarketSource: "csfloat",
                activeAIProvider: "gemini-pro",
                syncIntervalMin: 5,
                csgotraderSubProvider: "csfloat",
                openAiApiKey: "",
                geminiApiKey: "",
                csfloatApiKey: "",
            });
        }

        // Return settings (send empty strings instead of null for UI forms)
        return NextResponse.json({
            activeMarketSource: settings.activeMarketSource,
            csgotraderSubProvider: settings.csgotraderSubProvider ?? "csfloat",
            activeAIProvider: settings.activeAIProvider,
            syncIntervalMin: settings.syncIntervalMin,
            openAiApiKey: maskApiKey(settings.openAiApiKey),
            geminiApiKey: maskApiKey(settings.geminiApiKey),
            csfloatApiKey: maskApiKey(settings.csfloatApiKey),
        });
    } catch (error) {
        console.error("[Settings API GET Error]", error);
        return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const session = await auth();
    let userId: string | undefined;

    if (session?.user?.id) {
        userId = session.user.id;
    } else if (process.env.NODE_ENV === "development") {
        const firstUser = await prisma.user.findFirst();
        if (firstUser) userId = firstUser.id;
    }

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();

        // Validate request body with Zod
        const parseResult = settingsSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json(
                { error: "Invalid settings data", details: parseResult.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const {
            activeMarketSource,
            activeAIProvider,
            syncIntervalMin,
            openAiApiKey,
            geminiApiKey,
            csfloatApiKey,
            csgotraderSubProvider,
        } = parseResult.data;
        // Upsert to ensure singleton exists
        const updated = await prisma.appSettings.upsert({
            where: { id: "singleton" },
            update: {
                activeMarketSource,
                activeAIProvider,
                syncIntervalMin,
                openAiApiKey: openAiApiKey || null,
                geminiApiKey: geminiApiKey || null,
                csfloatApiKey: csfloatApiKey || null,
                csgotraderSubProvider,
            },
            create: {
                id: "singleton",
                activeMarketSource: activeMarketSource ?? "csfloat",
                activeAIProvider: activeAIProvider ?? "gemini-pro",
                syncIntervalMin: syncIntervalMin ?? 5,
                openAiApiKey: openAiApiKey || null,
                geminiApiKey: geminiApiKey || null,
                csfloatApiKey: csfloatApiKey || null,
                csgotraderSubProvider: csgotraderSubProvider ?? "csfloat",
            },
        });

        // Trigger cache revalidations globally since these settings impact AI and Market engines everywhere
        revalidatePath("/", "layout");

        return NextResponse.json({
            activeMarketSource: updated.activeMarketSource,
            activeAIProvider: updated.activeAIProvider,
            syncIntervalMin: updated.syncIntervalMin,
            openAiApiKey: maskApiKey(updated.openAiApiKey),
            geminiApiKey: maskApiKey(updated.geminiApiKey),
            csfloatApiKey: maskApiKey(updated.csfloatApiKey),
            csgotraderSubProvider: updated.csgotraderSubProvider,
        });
    } catch (error) {
        console.error("[Settings API PATCH Error]", error);
        return NextResponse.json({ error: "Failed to strictly update settings" }, { status: 500 });
    }
}
