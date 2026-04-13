import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";

const MAX_TITLE_LENGTH = 100;

export async function GET() {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;

        const orphanCount = await prisma.chatMessage.count({
            where: { userId, sessionId: null },
        });

        if (orphanCount > 0) {
            const legacySession = await prisma.chatSession.create({
                data: {
                    userId,
                    title: "Previous Chat",
                },
            });

            await prisma.chatMessage.updateMany({
                where: { userId, sessionId: null },
                data: { sessionId: legacySession.id },
            });
        }

        const sessions = await prisma.chatSession.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                title: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { messages: true } },
            },
        });

        return NextResponse.json({ success: true, data: sessions });
    } catch (error) {
        console.error("[API /chat/sessions GET]", error);
        return NextResponse.json(
            { success: false, error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;
        const body = await request.json().catch(() => ({}));
        const title = typeof body.title === "string"
            ? body.title.slice(0, MAX_TITLE_LENGTH).trim() || "New Chat"
            : "New Chat";

        const chatSession = await prisma.chatSession.create({
            data: { userId, title },
            select: {
                id: true,
                title: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ success: true, data: chatSession }, { status: 201 });
    } catch (error) {
        console.error("[API /chat/sessions POST]", error);
        return NextResponse.json(
            { success: false, error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
