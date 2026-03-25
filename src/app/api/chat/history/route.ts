import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth/auth";

export async function GET() {
    try {
        const session = await auth();
        let userId: string | undefined;

        if (session?.user?.id) {
            userId = session.user.id;
        } else if (process.env.NODE_ENV === "development") {
            const firstUser = await prisma.user.findFirst();
            if (firstUser) userId = firstUser.id;
        }

        if (!userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

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
