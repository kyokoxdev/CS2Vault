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

export function parseSimplePriceFormat(
    data: Record<string, { price: number | null }>
): Map<string, number> {
    const out = new Map<string, number>();

    for (const [hashName, entry] of Object.entries(data)) {
        const price = entry?.price;
        if (!isValidPositiveNumber(price)) continue;
        out.set(hashName, price);
    }

    return out;
}

export function parseKeyValueFormat(data: Record<string, number>): Map<string, number> {
    const out = new Map<string, number>();

    for (const [hashName, price] of Object.entries(data)) {
        if (!isValidPositiveNumber(price)) continue;
        out.set(hashName, price);
    }

    return out;
}

export function parseMultiModeFormat(
    data: Record<string, unknown>,
    mode: string
): Map<string, number> {
    const out = new Map<string, number>();

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
        out.set(hashName, candidate);
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
