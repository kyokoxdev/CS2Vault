require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const items = await prisma.item.findMany({ select: { id: true, name: true, isActive: true } });
    const asiimovs = items.filter(i => i.name.toLowerCase().includes('asiimov'));
    console.log('Asiimovs:', asiimovs.map(i => i.name));

    const trigons = items.filter(i => i.name.toLowerCase().includes('trigon'));
    console.log('Trigons:', trigons.map(i => i.name));
}

main().catch(console.error).finally(() => prisma.$disconnect());
