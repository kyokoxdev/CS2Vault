import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildMarketContext } from '@/lib/ai/context';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || 'awp asiimov';

    const ctx = await buildMarketContext(undefined, q);

    // Also fetch items matching awp asiimov directly
    const items = await prisma.item.findMany({
        where: { name: { contains: 'asiimov' } },
        include: { priceSnapshots: { orderBy: { timestamp: 'desc' }, take: 5 } }
    });

    return NextResponse.json({
        query: q,
        contextData: ctx.targetedItemData,
        dbAsiimovItems: items.map(i => ({ name: i.name, snapshotsCount: i.priceSnapshots.length }))
    });
}
