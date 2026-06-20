import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { appendAegisTrace, decideAegisApproval, getPendingApprovalForAction, updateAegisActionStatus } from "@/lib/aegis/ledger";

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
    try {
        const { session, error: authError } = await requireAuth();
        if (authError) return authError;

        const { id } = await context.params;
        const approval = await getPendingApprovalForAction(id, session.user.id);
        if (!approval) {
            return NextResponse.json({ success: false, error: "Approval request not found" }, { status: 404 });
        }

        await decideAegisApproval(approval.id, session.user.id, "rejected", { rejected: true });
        const action = await updateAegisActionStatus(approval.actionId, session.user.id, "rejected");
        await appendAegisTrace({
            runId: approval.runId,
            userId: session.user.id,
            type: "aegis.stage",
            stage: "approval",
            message: "Aegis action rejected.",
            payload: { actionId: approval.actionId, approvalId: approval.id },
        });

        return NextResponse.json({ success: true, data: action });
    } catch (error) {
        console.error("[API /aegis/actions/[id]/reject POST]", error);
        return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
    }
}
