import { prisma } from "@/lib/db";

export type ProviderJsonPrimitive = string | number | boolean | null;
export type ProviderJsonValue = ProviderJsonPrimitive | ProviderJsonObject | ProviderJsonValue[];
export type ProviderInputJsonValue = Exclude<ProviderJsonPrimitive, null> | ProviderJsonObject | ProviderJsonValue[];

export interface ProviderJsonObject {
    [key: string]: ProviderJsonValue;
}

export interface ProviderCacheKey {
    provider: string;
    lookupType: string;
    lookupKey: string;
}

export interface ProviderCacheEntry<TNormalized extends ProviderJsonValue = ProviderJsonValue> {
    provider: string;
    lookupType: string;
    lookupKey: string;
    itemId?: string | null;
    rawPayload: ProviderJsonValue;
    normalizedPayload: TNormalized;
    fetchedAt: Date;
    expiresAt?: Date | null;
}

export interface ProviderCacheLookup<TNormalized extends ProviderJsonValue = ProviderJsonValue> {
    hit: boolean;
    entry?: ProviderCacheEntry<TNormalized>;
    fetchedAt?: Date;
    expiresAt?: Date | null;
}

export interface WriteProviderCacheInput<TNormalized extends ProviderJsonValue = ProviderJsonValue> extends ProviderCacheKey {
    itemId?: string | null;
    rawPayload: ProviderInputJsonValue;
    normalizedPayload: TNormalized & ProviderInputJsonValue;
    ttlMs?: number;
    fetchedAt?: Date;
}

interface ProviderCacheRecord {
    provider: string;
    lookupType: string;
    lookupKey: string;
    itemId: string | null;
    rawPayload: ProviderJsonValue;
    normalizedPayload: ProviderJsonValue;
    fetchedAt: Date;
    expiresAt: Date | null;
}

function toProviderCacheEntry<TNormalized extends ProviderJsonValue>(record: ProviderCacheRecord): ProviderCacheEntry<TNormalized> {
    return {
        provider: record.provider,
        lookupType: record.lookupType,
        lookupKey: record.lookupKey,
        itemId: record.itemId,
        rawPayload: record.rawPayload,
        normalizedPayload: record.normalizedPayload as TNormalized,
        fetchedAt: record.fetchedAt,
        expiresAt: record.expiresAt,
    };
}

export async function readProviderCache<TNormalized extends ProviderJsonValue = ProviderJsonValue>(
    key: ProviderCacheKey,
    now: Date = new Date()
): Promise<ProviderCacheLookup<TNormalized>> {
    const record = await prisma.intelligenceProviderCache.findUnique({
        where: {
            provider_lookupType_lookupKey: key,
        },
    });

    if (!record) {
        return { hit: false };
    }

    const cacheRecord = record as ProviderCacheRecord;
    const isFresh = !cacheRecord.expiresAt || cacheRecord.expiresAt.getTime() > now.getTime();

    return {
        hit: isFresh,
        entry: isFresh ? toProviderCacheEntry<TNormalized>(cacheRecord) : undefined,
        fetchedAt: cacheRecord.fetchedAt,
        expiresAt: cacheRecord.expiresAt,
    };
}

export async function writeProviderCache<TNormalized extends ProviderJsonValue = ProviderJsonValue>(
    input: WriteProviderCacheInput<TNormalized>
): Promise<ProviderCacheEntry<TNormalized>> {
    const fetchedAt = input.fetchedAt ?? new Date();
    const expiresAt = input.ttlMs === undefined ? null : new Date(fetchedAt.getTime() + input.ttlMs);
    const record = await prisma.intelligenceProviderCache.upsert({
        where: {
            provider_lookupType_lookupKey: {
                provider: input.provider,
                lookupType: input.lookupType,
                lookupKey: input.lookupKey,
            },
        },
        update: {
            itemId: input.itemId ?? null,
            rawPayload: input.rawPayload,
            normalizedPayload: input.normalizedPayload,
            fetchedAt,
            expiresAt,
        },
        create: {
            provider: input.provider,
            lookupType: input.lookupType,
            lookupKey: input.lookupKey,
            itemId: input.itemId ?? null,
            rawPayload: input.rawPayload,
            normalizedPayload: input.normalizedPayload,
            fetchedAt,
            expiresAt,
        },
    });

    return toProviderCacheEntry<TNormalized>(record as ProviderCacheRecord);
}
