import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const userId = session.user.id;
        const { id } = await params;

        const chatSession = await prisma.chatSession.findFirst({
            where: { id, userId },
        });

        if (!chatSession) {
            return NextResponse.json(
                { success: false, error: "Session not found" },
                { status: 404 }
            );
        }

        await prisma.chatSession.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[API /chat/sessions/[id] DELETE]", error);
        return NextResponse.json(
            { success: false, error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
