import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { createAndDispatchAegisRun } from "@/lib/aegis/runs";
import { listAegisRunsForUser } from "@/lib/aegis/ledger";
import { prisma } from "@/lib/db";
import {
    AI_AGENT_MODE_VALUES,
    AI_PROVIDER_VALUES,
    AI_REASONING_DEPTH_VALUES,
} from "@/lib/ai/model-labels";

const CreateRunSchema = z.object({
    input: z.string().min(1).max(4000),
    sessionId: z.string().optional(),
    provider: z.enum(AI_PROVIDER_VALUES).optional(),
    agentMode: z.enum(AI_AGENT_MODE_VALUES).optional(),
    reasoningDepth: z.enum(AI_REASONING_DEPTH_VALUES).optional(),
    openRouterModelId: z.string().max(160).optional(),
    deepResearch: z.boolean().optional(),
});

export async function GET() {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const runs = await listAegisRunsForUser(session.user.id);
        return NextResponse.json({ success: true, data: runs });
    } catch (error) {
        console.error("[API /aegis/runs GET]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const body = await request.json();
        const data = CreateRunSchema.parse(body);
        let validatedSessionId: string | undefined;

        if (data.sessionId) {
            const ownedSession = await prisma.chatSession.findFirst({
                where: { id: data.sessionId, userId: session.user.id },
                select: { id: true },
            });
            if (!ownedSession) {
                return NextResponse.json({ success: false, error: "Chat session not found." }, { status: 404 });
            }
            validatedSessionId = ownedSession.id;
        }

        const run = await createAndDispatchAegisRun({
            userId: session.user.id,
            input: data.input,
            sessionId: validatedSessionId,
            provider: data.provider,
            agentMode: data.agentMode,
            reasoningDepth: data.reasoningDepth,
            openRouterModelId: data.openRouterModelId,
            deepResearch: data.deepResearch,
        });

        return NextResponse.json({ success: true, data: run }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: "Invalid request format" }, { status: 400 });
        }

        console.error("[API /aegis/runs POST]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
