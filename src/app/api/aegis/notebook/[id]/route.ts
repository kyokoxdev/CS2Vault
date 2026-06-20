import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { archiveAegisMemory, getAegisMemoryForUser, updateAegisMemory } from "@/lib/aegis/memory/notebook";
import { embedAegisMemory } from "@/lib/aegis/memory/embeddings";

const UpdateMemorySchema = z.object({
    title: z.string().min(1).max(160).optional(),
    content: z.string().min(1).max(4000).optional(),
    kind: z.string().min(1).max(80).optional(),
    tags: z.array(z.string().min(1).max(40)).max(12).optional(),
    source: z.string().max(160).optional(),
    confidence: z.number().min(0).max(1).optional(),
});

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await context.params;
        const memory = await getAegisMemoryForUser(id, session.user.id);
        if (!memory) {
            return NextResponse.json({ success: false, error: "Aegis memory not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: memory });
    } catch (error) {
        console.error("[API /aegis/notebook/[id] GET]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await context.params;
        const input = UpdateMemorySchema.parse(await request.json());
        const memory = await updateAegisMemory(session.user.id, id, input);
        if (input.content !== undefined) {
            await embedAegisMemory(memory.id, session.user.id);
        }

        return NextResponse.json({ success: true, data: memory });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: "Invalid request format" }, { status: 400 });
        }

        console.error("[API /aegis/notebook/[id] PATCH]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await context.params;
        const memory = await archiveAegisMemory(session.user.id, id);
        return NextResponse.json({ success: true, data: memory });
    } catch (error) {
        console.error("[API /aegis/notebook/[id] DELETE]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
