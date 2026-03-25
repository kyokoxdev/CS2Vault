import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";

export async function GET() {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;

        const messages = await prisma.chatMessage.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 100, // Load last 100 messages for history
            select: {
                id: true,
                role: true,
                content: true,
                createdAt: true
            }
        });

        return NextResponse.json({ success: true, data: messages.reverse() });
    } catch (error) {
        console.error("[API /chat GET]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
