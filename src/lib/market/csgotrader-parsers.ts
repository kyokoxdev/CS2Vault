import type { CSGOTraderSubProvider } from "@/types";

const isValidPositiveNumber = (value: unknown): value is number => {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        !Number.isNaN(value) &&
        value > 0
    );
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return value !== null && typeof value === "object";
};

function extractVolumeFromEntry(entry: Record<string, unknown>): unknown {
    if (isValidPositiveNumber(entry.volume)) return entry.volume;

    const steamData = entry.steam;
    if (isRecord(steamData) && isValidPositiveNumber(steamData.volume)) {
        return steamData.volume;
    }

    return undefined;
}

export interface PriceVolumeEntry {
    price: number;
    volume?: number;
}

export function parseSimplePriceFormat(
    data: Record<string, { price: number | null; volume?: number | null }>
): Map<string, PriceVolumeEntry> {
    const out = new Map<string, PriceVolumeEntry>();

    for (const [hashName, entry] of Object.entries(data)) {
        const price = entry?.price;
        if (!isValidPositiveNumber(price)) continue;
        out.set(hashName, {
            price,
            volume: isValidPositiveNumber(entry?.volume) ? entry.volume : undefined,
        });
    }

    return out;
}

export function parseKeyValueFormat(data: Record<string, number>): Map<string, PriceVolumeEntry> {
    const out = new Map<string, PriceVolumeEntry>();
    for (const [hashName, price] of Object.entries(data)) {
        if (!isValidPositiveNumber(price)) continue;
        out.set(hashName, { price });
    }

    return out;
}

export function parseMultiModeFormat(
    data: Record<string, unknown>,
    mode: string
): Map<string, PriceVolumeEntry> {
    const out = new Map<string, PriceVolumeEntry>();

    for (const [hashName, rawEntry] of Object.entries(data)) {
        if (!isRecord(rawEntry)) continue;
        const entry = rawEntry;

        let candidate: unknown;

        if (mode === "last_24h" || mode === "last_7d" || mode === "last_30d") {
            candidate = entry[mode];
        } else if (mode === "price") {
            candidate = entry.price;
        } else if (mode === "instant_sale_price") {
            candidate = entry.instant_sale_price;
        } else if (mode === "starting_at") {
            const startingAt = entry.starting_at;
            if (startingAt && typeof startingAt === "object") {
                candidate = (startingAt as { price?: unknown }).price;
            } else {
                candidate = startingAt;
            }
        } else if (mode === "suggested_price") {
            candidate = entry.suggested_price;
        } else if (mode === "highest_order") {
            const highestOrder = entry.highest_order;
            if (highestOrder && typeof highestOrder === "object") {
                candidate = (highestOrder as { price?: unknown }).price;
            }
        }

        if (!isValidPositiveNumber(candidate)) continue;

        const volume = extractVolumeFromEntry(entry);

        out.set(hashName, {
            price: candidate,
            volume: isValidPositiveNumber(volume) ? volume : undefined,
        });
    }

    return out;
}

export const PROVIDER_FORMAT_MAP: Record<
    CSGOTraderSubProvider,
    {
        parser: "simple" | "keyvalue" | "multimode";
        defaultMode?: string;
    }
> = {
    csgotrader: { parser: "simple" },
    csfloat: { parser: "simple" },
    csmoney: { parser: "simple" },
    cstrade: { parser: "simple" },
    lisskins: { parser: "simple" },
    lootfarm: { parser: "keyvalue" },
    csgotm: { parser: "keyvalue" },
    csgoempire: { parser: "keyvalue" },
    swapgg: { parser: "keyvalue" },
    youpin: { parser: "keyvalue" },
    steam: { parser: "multimode", defaultMode: "last_24h" },
    bitskins: { parser: "multimode", defaultMode: "price" },
    skinport: { parser: "multimode", defaultMode: "starting_at" },
    buff163: { parser: "multimode", defaultMode: "starting_at" },
};
