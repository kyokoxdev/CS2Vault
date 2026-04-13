import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";

export async function GET(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;
        const sessionId = request.nextUrl.searchParams.get("sessionId");

        const where: { userId: string; sessionId?: string } = { userId };
        if (sessionId) {
            where.sessionId = sessionId;
        }

        const messages = await prisma.chatMessage.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
                id: true,
                role: true,
                content: true,
                createdAt: true
            }
        });

        return NextResponse.json({ success: true, data: messages.reverse() });
    } catch (error) {
        console.error("[API /chat/history GET]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
