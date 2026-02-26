import { prisma } from "@/lib/db";

export type PriceActivity = {
  itemId: string;
  itemName: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
  direction: "up" | "down";
  detectedAt: Date;
};

export async function detectSignificantChanges(
  options?: {
    thresholdPercent?: number;
    hoursBack?: number;
    limit?: number;
  }
): Promise<PriceActivity[]> {
  const thresholdPercent = options?.thresholdPercent ?? 5;
  const hoursBack = options?.hoursBack ?? 24;
  const limit = options?.limit ?? 20;

  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      timestamp: { gte: cutoff },
    },
    include: { item: true },
    orderBy: { timestamp: "asc" },
  });

  // Group by itemId
  const groups = new Map<
    string,
    Array<{ price: number; timestamp: Date; itemName: string }>
  >();

  for (const snap of snapshots) {
    const group = groups.get(snap.itemId) ?? [];
    group.push({
      price: snap.price,
      timestamp: snap.timestamp,
      itemName: snap.item.name,
    });
    groups.set(snap.itemId, group);
  }

  const detectedAt = new Date();
  const results: PriceActivity[] = [];

  for (const [itemId, group] of groups) {
    // Skip items with only 1 snapshot (can't compute change)
    if (group.length < 2) continue;

    // Already sorted by timestamp asc from the query
    const earliest = group[0];
    const latest = group[group.length - 1];

    if (earliest.price === 0) continue; // Avoid division by zero

    const changePercent =
      ((latest.price - earliest.price) / earliest.price) * 100;

    if (Math.abs(changePercent) <= thresholdPercent) continue;

    results.push({
      itemId,
      itemName: earliest.itemName,
      previousPrice: earliest.price,
      currentPrice: latest.price,
      changePercent: Math.round(changePercent * 100) / 100,
      direction: changePercent > 0 ? "up" : "down",
      detectedAt,
    });
  }

  // Sort by absolute changePercent descending
  results.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  return results.slice(0, limit);
}
