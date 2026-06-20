import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { getAegisRunForUser } from "@/lib/aegis/ledger";

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await context.params;
        const run = await getAegisRunForUser(id, session.user.id);

        if (!run) {
            return NextResponse.json({ success: false, error: "Aegis run not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: run });
    } catch (error) {
        console.error("[API /aegis/runs/[id] GET]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
