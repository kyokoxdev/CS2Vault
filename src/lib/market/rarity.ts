const RARITY_RULES: Array<[string, string]> = [
    ["contraband", "Contraband"],
    ["covert", "Covert"],
    ["classified", "Classified"],
    ["restricted", "Restricted"],
    ["mil-spec", "Mil-Spec"],
    ["industrial grade", "Industrial Grade"],
    ["consumer grade", "Consumer Grade"],
    ["base grade", "Base Grade"],
    ["distinguished", "Distinguished"],
    ["exceptional", "Exceptional"],
    ["superior", "Superior"],
    ["master", "Master"],
    ["high grade", "High Grade"],
    ["remarkable", "Remarkable"],
    ["exotic", "Exotic"],
    ["extraordinary", "Extraordinary"],
];

const QUALITY_LABELS = new Set(["normal", "stattrak", "souvenir"]);

function stripTrademark(value: string): string {
    return value.replace(/\u2122/g, "").trim();
}

export function detectRarityFromType(steamType?: string | null): string | null {
    if (!steamType) return null;
    const type = stripTrademark(steamType).toLowerCase();

    for (const [key, label] of RARITY_RULES) {
        if (type.includes(key)) return label;
    }
    return null;
}

export function normalizeRarity(raw?: string | null): string | null {
    if (!raw) return null;
    const cleaned = stripTrademark(raw);
    if (!cleaned) return null;

    const detected = detectRarityFromType(cleaned);
    if (detected) return detected;

    const lower = cleaned.toLowerCase();
    if (QUALITY_LABELS.has(lower)) return null;

    return raw.trim();
}

export function detectTypeFromTagsOrName(
    qualityTag?: string | null,
    hashName?: string | null
): string | null {
    if (qualityTag) {
        const cleaned = stripTrademark(qualityTag).trim();
        if (cleaned) return cleaned;
    }
    if (!hashName) return null;
    const lowered = hashName.toLowerCase();
    if (lowered.includes("stattrak")) return "StatTrak";
    if (lowered.includes("souvenir")) return "Souvenir";
    return "Normal";
}

export function detectTypeFromName(hashName?: string | null): string | null {
    return detectTypeFromTagsOrName(null, hashName ?? null);
}

export function normalizeItemType(raw?: string | null): string | null {
    if (!raw) return null;
    const cleaned = stripTrademark(raw).trim();
    if (!cleaned) return null;
    const lower = cleaned.toLowerCase();
    if (!QUALITY_LABELS.has(lower)) return null;
    if (lower === "stattrak") return "StatTrak";
    if (lower === "souvenir") return "Souvenir";
    return "Normal";
}

export const RARITY_LABELS = RARITY_RULES.map(([, label]) => label);

export const RARITY_VARIANTS: Record<string, string> = {
  "Contraband": "contraband",
  "Covert": "covert",
  "Classified": "classified",
  "Restricted": "restricted",
  "Mil-Spec": "milspec",
  "Industrial Grade": "industrial",
  "Consumer Grade": "consumer",
  "Base Grade": "consumer",
  "Distinguished": "milspec",
  "Exceptional": "restricted",
  "Superior": "classified",
  "Master": "covert",
  "High Grade": "milspec",
  "Remarkable": "restricted",
  "Exotic": "classified",
  "Extraordinary": "covert",
};

export function detectWearQuality(exterior?: string | null): string | null {
    if (!exterior) return null;
    const normalized = exterior.toLowerCase();
    if (normalized.includes("factory new")) return "Factory New";
    if (normalized.includes("minimal wear")) return "Minimal Wear";
    if (normalized.includes("field-tested")) return "Field-Tested";
    if (normalized.includes("well-worn")) return "Well-Worn";
    if (normalized.includes("battle-scarred")) return "Battle-Scarred";
    return null;
}
