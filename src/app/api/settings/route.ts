import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guard";
import { z } from "zod/v4";
import { resetProviders } from "@/lib/market/init";

// Zod schema for settings validation
const settingsSchema = z.object({
    activeMarketSource: z.enum(["pricempire", "csfloat", "csgotrader", "steam"]).optional(),
    csgotraderSubProvider: z.enum(["csgotrader", "bitskins", "steam", "csmoney", "csgotm", "lootfarm", "skinport", "csgoempire", "swapgg", "buff163", "cstrade", "csfloat", "youpin", "lisskins"]).optional(),
    activeAIProvider: z.enum(["gemini-pro", "gemini-flash", "openai"]).optional(),
    priceRefreshIntervalMin: z.number().int().min(1).max(1440).optional(),
    openAiApiKey: z.string().max(256).optional(),
    geminiApiKey: z.string().max(256).optional(),
    csfloatApiKey: z.string().max(256).optional(),
});

function maskApiKey(key: string | null | undefined, envFallback?: string): string {
    const effective = key || envFallback;
    if (!effective || effective.length < 8) return "";
    const prefix = effective.slice(0, 4);
    const suffix = effective.slice(-4);
    return `${prefix}...${suffix}`;
}

export async function GET() {
    let userId: string | undefined;

    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        userId = session.user.id;

        const settings = await prisma.appSettings.findUnique({
            where: { id: "singleton" },
        });

        if (!settings) {
            return NextResponse.json({
                activeMarketSource: "csfloat",
                activeAIProvider: "gemini-pro",
                priceRefreshIntervalMin: 15,
                csgotraderSubProvider: "csfloat",
                openAiApiKey: maskApiKey(null, process.env.OPENAI_API_KEY),
                geminiApiKey: maskApiKey(null, process.env.GEMINI_API_KEY),
                csfloatApiKey: maskApiKey(null, process.env.CSFLOAT_API_KEY),
            });
        }

        return NextResponse.json({
            activeMarketSource: settings.activeMarketSource,
            csgotraderSubProvider: settings.csgotraderSubProvider ?? "csfloat",
            activeAIProvider: settings.activeAIProvider,
            priceRefreshIntervalMin: settings.priceRefreshIntervalMin ?? 15,
            openAiApiKey: maskApiKey(settings.openAiApiKey, process.env.OPENAI_API_KEY),
            geminiApiKey: maskApiKey(settings.geminiApiKey, process.env.GEMINI_API_KEY),
            csfloatApiKey: maskApiKey(settings.csfloatApiKey, process.env.CSFLOAT_API_KEY),
        });
    } catch (error) {
        console.error("[Settings API GET Error]", { userId, error });
        return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    let userId: string | undefined;

    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        userId = session.user.id;

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
            priceRefreshIntervalMin,
            openAiApiKey,
            geminiApiKey,
            csfloatApiKey,
            csgotraderSubProvider,
        } = parseResult.data;

		const existing = await prisma.appSettings.findUnique({ where: { id: "singleton" } });

		function resolveApiKey(
			incoming: string | undefined,
			existingValue: string | null | undefined,
			envFallback?: string
		): string | null | undefined {
			if (incoming === undefined) return undefined;
			if (incoming === "") return null;
			if (incoming === maskApiKey(existingValue, envFallback)) return undefined;
			return incoming;
		}

		const resolvedOpenAi = resolveApiKey(openAiApiKey, existing?.openAiApiKey, process.env.OPENAI_API_KEY);
		const resolvedGemini = resolveApiKey(geminiApiKey, existing?.geminiApiKey, process.env.GEMINI_API_KEY);
		const resolvedCsfloat = resolveApiKey(csfloatApiKey, existing?.csfloatApiKey, process.env.CSFLOAT_API_KEY);
        // Upsert to ensure singleton exists
        const updated = await prisma.appSettings.upsert({
            where: { id: "singleton" },
            update: {
                activeMarketSource,
                activeAIProvider,
                priceRefreshIntervalMin,
				...(resolvedOpenAi !== undefined && { openAiApiKey: resolvedOpenAi }),
				...(resolvedGemini !== undefined && { geminiApiKey: resolvedGemini }),
				...(resolvedCsfloat !== undefined && { csfloatApiKey: resolvedCsfloat }),
                csgotraderSubProvider,
            },
            create: {
                id: "singleton",
                activeMarketSource: activeMarketSource ?? "csfloat",
                activeAIProvider: activeAIProvider ?? "gemini-pro",
                priceRefreshIntervalMin: priceRefreshIntervalMin ?? 15,
				openAiApiKey: resolvedOpenAi ?? null,
				geminiApiKey: resolvedGemini ?? null,
				csfloatApiKey: resolvedCsfloat ?? null,
                csgotraderSubProvider: csgotraderSubProvider ?? "csfloat",
            },
        });

        if (activeMarketSource) {
            await resetProviders();
        }

        // Trigger cache revalidations globally since these settings impact AI and Market engines everywhere
        revalidatePath("/", "layout");

        return NextResponse.json({
            activeMarketSource: updated.activeMarketSource,
            activeAIProvider: updated.activeAIProvider,
            priceRefreshIntervalMin: updated.priceRefreshIntervalMin ?? 15,
            openAiApiKey: maskApiKey(updated.openAiApiKey, process.env.OPENAI_API_KEY),
            geminiApiKey: maskApiKey(updated.geminiApiKey, process.env.GEMINI_API_KEY),
            csfloatApiKey: maskApiKey(updated.csfloatApiKey, process.env.CSFLOAT_API_KEY),
            csgotraderSubProvider: updated.csgotraderSubProvider,
        });
    } catch (error) {
        console.error("[Settings API PATCH Error]", { userId, error });
        return NextResponse.json({ error: "Failed to strictly update settings" }, { status: 500 });
    }
}
