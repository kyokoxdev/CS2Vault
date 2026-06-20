import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { getAegisRunForUser, listAegisTraces } from "@/lib/aegis/ledger";

interface RouteContext {
    params: Promise<{ id: string }>;
}

function parseAfterSequence(request: NextRequest) {
    const raw = request.nextUrl.searchParams.get("after");
    if (!raw) return 0;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await context.params;
        const run = await getAegisRunForUser(id, session.user.id);
        if (!run) {
            return NextResponse.json({ success: false, error: "Aegis run not found" }, { status: 404 });
        }

        const traces = await listAegisTraces(id, session.user.id, parseAfterSequence(request));
        return NextResponse.json({ success: true, data: traces });
    } catch (error) {
        console.error("[API /aegis/runs/[id]/stream GET]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
