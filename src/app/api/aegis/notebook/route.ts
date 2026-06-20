import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { createAegisMemory, listAegisMemories } from "@/lib/aegis/memory/notebook";
import { embedAegisMemory } from "@/lib/aegis/memory/embeddings";

const MemoryInputSchema = z.object({
    title: z.string().min(1).max(160),
    content: z.string().min(1).max(4000),
    kind: z.string().min(1).max(80).optional(),
    tags: z.array(z.string().min(1).max(40)).max(12).optional(),
    source: z.string().max(160).optional(),
    confidence: z.number().min(0).max(1).optional(),
});

export async function GET(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
        const memories = await listAegisMemories(session.user.id, includeArchived);
        return NextResponse.json({ success: true, data: memories });
    } catch (error) {
        console.error("[API /aegis/notebook GET]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const body = await request.json();
        const input = MemoryInputSchema.parse(body);
        const memory = await createAegisMemory(session.user.id, input);
        await embedAegisMemory(memory.id, session.user.id);
        return NextResponse.json({ success: true, data: memory }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: "Invalid request format" }, { status: 400 });
        }

        console.error("[API /aegis/notebook POST]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
