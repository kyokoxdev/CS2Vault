import { prisma } from "@/lib/db";

export interface WatchlistGroupSummary {
    id: string;
    name: string;
    color: string | null;
}

interface ItemGroupWithGroup {
    group: WatchlistGroupSummary;
}

export function mapWatchlistGroups(groups: ItemGroupWithGroup[]): WatchlistGroupSummary[] {
    return groups.map(({ group }) => group);
}

export async function restoreGlobalItemGroups(itemId: string, groupIds: string[] | undefined): Promise<void> {
    const uniqueGroupIds = [...new Set(groupIds ?? [])];
    if (uniqueGroupIds.length === 0) {
        return;
    }

    const groups = await prisma.watchlistGroup.findMany({
        where: { id: { in: uniqueGroupIds } },
        select: { id: true },
    });
    const existingGroups = new Set(groups.map((group) => group.id));
    const validGroupIds = uniqueGroupIds.filter((groupId) => existingGroups.has(groupId));

    if (validGroupIds.length === 0) {
        return;
    }

    const existingLinks = await prisma.itemGroup.findMany({
        where: { itemId, groupId: { in: validGroupIds } },
        select: { groupId: true },
    });
    const existingLinkGroupIds = new Set(existingLinks.map((link) => link.groupId));
    const missingGroupIds = validGroupIds.filter((groupId) => !existingLinkGroupIds.has(groupId));

    if (missingGroupIds.length === 0) {
        return;
    }

    await prisma.itemGroup.createMany({
        data: missingGroupIds.map((groupId) => ({ itemId, groupId })),
    });
}
