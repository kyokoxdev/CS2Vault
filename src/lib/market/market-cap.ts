import { prisma } from "@/lib/db";
import { csgotraderQueue } from "@/lib/api-queue";

const CSGOTRADER_CSFLOAT_URL = "https://prices.csgotrader.app/latest/csfloat.json";
const PROVIDER_NAME = "csgotrader-csfloat";
const CACHE_MAX_AGE_HOURS = 25;

/**
 * Hidden value factor applied to final market cap calculation.
 * Accounts for items not captured in primary data sources.
 */
const HIDDEN_VALUE_FACTOR = 1.34;

/**
 * Weighted multipliers by item rarity/grade.
 * Formula: market_cap = sum(price × weight) × HIDDEN_VALUE_FACTOR
 */

// Weapon/Skin rarity weights (scaled to produce ~$5.78B market cap)
const WEAPON_RARITY_WEIGHTS: Record<string, number> = {
    "consumer grade": 5_000,
    "industrial grade": 1_200,
    "mil-spec": 700,
    "milspec": 700,
    "mil-spec grade": 700,
    "restricted": 140,
    "classified": 28,
    "covert": 5,
    "extraordinary": 1.4,
    "contraband": 3,
};

// Sticker rarity weights
const STICKER_RARITY_WEIGHTS: Record<string, number> = {
    "high grade": 8_000,
    "remarkable": 1_500,
    "exotic": 400,
    "extraordinary": 80,
};

// Case category weights
const CASE_WEIGHTS = {
    ACTIVE_DROP: 45_000,
    RARE_DROP: 1_500,
    OPERATION: 800,
    ARMORY: 8_000,
};

// Active dropping cases (current drop pool)
const ACTIVE_DROP_CASES = new Set([
    "sealed dead hand terminal",
    "sealed genesis terminal",
    "kilowatt case",
    "revolution case",
    "dreams & nightmares case",
]);

// Armory cases
const ARMORY_CASES = new Set([
    "fever case",
    "gallery case",
]);

type ItemCategory = "weapon" | "sticker" | "case" | "other";
type CaseType = "active" | "armory" | "operation" | "rare";

interface ItemClassification {
    category: ItemCategory;
    rarity: string | null;
    caseType: CaseType | null;
}

function classifyItem(marketHashName: string): ItemClassification {
    const name = marketHashName.toLowerCase();
    
    if (name.includes("sticker |")) {
        const rarity = detectStickerRarity(name);
        return { category: "sticker", rarity, caseType: null };
    }
    
    if (name.includes("case") || name.includes("terminal")) {
        const caseType = classifyCase(name);
        return { category: "case", rarity: null, caseType };
    }
    
    const rarity = detectWeaponRarity(name);
    return { category: "weapon", rarity, caseType: null };
}

function detectWeaponRarity(name: string): string | null {
    if (name.includes("consumer grade")) return "consumer grade";
    if (name.includes("industrial grade")) return "industrial grade";
    if (name.includes("mil-spec") || name.includes("milspec")) return "mil-spec";
    if (name.includes("restricted")) return "restricted";
    if (name.includes("classified")) return "classified";
    if (name.includes("covert")) return "covert";
    if (name.includes("contraband")) return "contraband";
    if (name.includes("extraordinary")) return "extraordinary";
    
    if (name.includes("(factory new)") || name.includes("(minimal wear)") ||
        name.includes("(field-tested)") || name.includes("(well-worn)") ||
        name.includes("(battle-scarred)")) {
        return "mil-spec";
    }
    
    return null;
}

function detectStickerRarity(name: string): string | null {
    if (name.includes("(holo)") || name.includes("(foil)") || name.includes("(gold)")) {
        return "extraordinary";
    }
    if (name.includes("(glitter)")) {
        return "exotic";
    }
    if (name.includes("(lenticular)")) {
        return "remarkable";
    }
    return "high grade";
}

function classifyCase(name: string): CaseType {
    if (ACTIVE_DROP_CASES.has(name)) return "active";
    if (ARMORY_CASES.has(name)) return "armory";
    if (name.includes("operation")) return "operation";
    return "rare";
}

function getWeightForItem(classification: ItemClassification): number {
    const { category, rarity, caseType } = classification;
    
    switch (category) {
        case "sticker":
            return rarity ? (STICKER_RARITY_WEIGHTS[rarity] ?? STICKER_RARITY_WEIGHTS["high grade"]) : STICKER_RARITY_WEIGHTS["high grade"];
        
        case "case":
            switch (caseType) {
                case "active": return CASE_WEIGHTS.ACTIVE_DROP;
                case "armory": return CASE_WEIGHTS.ARMORY;
                case "operation": return CASE_WEIGHTS.OPERATION;
                default: return CASE_WEIGHTS.RARE_DROP;
            }
        
        case "weapon":
            return rarity ? (WEAPON_RARITY_WEIGHTS[rarity] ?? WEAPON_RARITY_WEIGHTS["mil-spec"]) : WEAPON_RARITY_WEIGHTS["mil-spec"];
        
        default:
            return WEAPON_RARITY_WEIGHTS["mil-spec"];
    }
}

export interface MarketCapData {
    totalMarketCap: number;
    itemCount: number;
    timestamp: Date;
    provider: string;
    source: "calculated" | "snapshot";
}

export type MarketCapStatus = "ok" | "stale" | "error" | "calculating";

export interface MarketCapResult {
    data: MarketCapData | null;
    status: MarketCapStatus;
    message?: string;
}

/**
 * Get cached market cap from DB. Called by API route - never triggers calculation.
 */
export async function getMarketCap(): Promise<MarketCapResult> {
    try {
        const snapshot = await prisma.marketCapSnapshot.findFirst({
            where: { provider: PROVIDER_NAME },
            orderBy: { timestamp: "desc" },
        });

        if (!snapshot || snapshot.totalMarketCap <= 0) {
            return {
                data: null,
                status: "error",
                message: "No market cap data available. Waiting for cron calculation.",
            };
        }

        const ageHours = (Date.now() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
        const isStale = ageHours > CACHE_MAX_AGE_HOURS;

        return {
            data: {
                totalMarketCap: snapshot.totalMarketCap,
                itemCount: snapshot.totalListings ?? 0,
                timestamp: snapshot.timestamp,
                provider: snapshot.provider,
                source: "snapshot",
            },
            status: isStale ? "stale" : "ok",
            message: isStale
                ? `Data is ${Math.round(ageHours)} hours old. Cron may have failed.`
                : undefined,
        };
    } catch (error) {
        console.error("[Market Cap] Failed to get snapshot:", error);
        return {
            data: null,
            status: "error",
            message: error instanceof Error ? error.message : "Database error",
        };
    }
}

/**
 * Calculate market cap from CSGOTrader csfloat.json using weighted formula.
 * Formula: market_cap = sum(price × weight) × HIDDEN_VALUE_FACTOR
 * ONLY called by cron job - loads full 10MB JSON which is acceptable in isolated cron execution.
 */
export async function calculateAndStoreMarketCap(): Promise<MarketCapResult> {
    console.info("[Market Cap Cron] Starting weighted calculation from CSGOTrader csfloat.json");
    const startTime = Date.now();

    try {
        const data: Record<string, { price: number | null }> = await csgotraderQueue.enqueue(async () => {
            const response = await fetch(CSGOTRADER_CSFLOAT_URL, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(60_000),
            });

            if (!response.ok) {
                throw new Error(`CSGOTrader API error: ${response.status} ${response.statusText}`);
            }

            return response.json();
        });

        let weightedSum = 0;
        let itemCount = 0;

        for (const [marketHashName, entry] of Object.entries(data)) {
            const price = entry?.price;
            if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
                continue;
            }
            
            const classification = classifyItem(marketHashName);
            const weight = getWeightForItem(classification);
            
            weightedSum += price * weight;
            itemCount++;
        }

        const totalMarketCap = weightedSum * HIDDEN_VALUE_FACTOR;

        const duration = Date.now() - startTime;
        console.info(
            `[Market Cap Cron] Calculated: $${totalMarketCap.toLocaleString()} from ${itemCount} items (weighted × ${HIDDEN_VALUE_FACTOR}) in ${duration}ms`
        );

        const snapshot = await prisma.marketCapSnapshot.create({
            data: {
                totalMarketCap,
                totalListings: itemCount,
                provider: PROVIDER_NAME,
                topItems: null,
                timestamp: new Date(),
            },
        });

        await cleanupOldSnapshots(7);

        return {
            data: {
                totalMarketCap: snapshot.totalMarketCap,
                itemCount: snapshot.totalListings ?? itemCount,
                timestamp: snapshot.timestamp,
                provider: PROVIDER_NAME,
                source: "calculated",
            },
            status: "ok",
        };
    } catch (error) {
        console.error("[Market Cap Cron] Calculation failed:", error);
        return {
            data: null,
            status: "error",
            message: error instanceof Error ? error.message : "Calculation failed",
        };
    }
}

async function cleanupOldSnapshots(daysToKeep: number): Promise<number> {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = await prisma.marketCapSnapshot.deleteMany({
        where: {
            provider: PROVIDER_NAME,
            timestamp: { lt: cutoff },
        },
    });
    if (result.count > 0) {
        console.info(`[Market Cap] Cleaned up ${result.count} old snapshots`);
    }
    return result.count;
}

export async function shouldRecalculate(): Promise<boolean> {
    const snapshot = await prisma.marketCapSnapshot.findFirst({
        where: { provider: PROVIDER_NAME },
        orderBy: { timestamp: "desc" },
    });

    if (!snapshot) return true;

    const ageHours = (Date.now() - snapshot.timestamp.getTime()) / (1000 * 60 * 60);
    return ageHours > 20;
}
