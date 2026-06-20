import type { Prisma } from "@/generated/prisma/client";
import {
    appendAegisLog,
    appendAegisTrace,
    createAegisAction,
    createAegisApproval,
    getAegisActionForUser,
    markAegisActionRunning,
    updateAegisActionStatus,
} from "../ledger";
import type { AegisToolName } from "../types";
import { readAegisPortfolio } from "../tools/portfolio-read";
import { updateAegisAcquiredPrice } from "../tools/update-acquired-price";
import { addAegisWatchlistItem } from "../tools/watchlist-add";
import {
    PortfolioReadActionInputSchema,
    UpdateAcquiredPriceActionInputSchema,
    WatchlistAddActionInputSchema,
    type AegisActionProposal,
} from "./types";

function toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toolPreview(tool: AegisToolName, input: unknown) {
    if (tool === "portfolio.read") return "Read active Steam-derived portfolio items.";
    if (tool === "watchlist.add") return "Add the matched item to the existing global watchlist.";

    const parsed = UpdateAcquiredPriceActionInputSchema.parse(input);
    return `Update cost basis for inventory item ${parsed.inventoryItemId} to ${parsed.acquiredPrice}.`;
}

export async function proposeAegisAction(proposal: AegisActionProposal) {
    const risk = proposal.tool === "portfolio.acquiredPrice.update" ? "edit" : "low";
    const status = risk === "edit" ? "waiting_approval" : "proposed";
    const action = await createAegisAction({
        runId: proposal.runId,
        userId: proposal.userId,
        tool: proposal.tool,
        status,
        risk,
        input: toJson(proposal.input),
        inputPreview: toolPreview(proposal.tool, proposal.input),
        idempotencyKey: proposal.idempotencyKey,
    });

    await appendAegisTrace({
        runId: proposal.runId,
        userId: proposal.userId,
        type: "aegis.action_preview",
        stage: "tools",
        message: action.inputPreview ?? "Aegis tool preview ready.",
        payload: toJson({ actionId: action.id, tool: action.tool, input: proposal.input, risk }),
    });

    if (risk === "edit" && !action.approval) {
        const approval = await createAegisApproval({
            runId: proposal.runId,
            actionId: action.id,
            userId: proposal.userId,
            request: toJson({ tool: action.tool, input: proposal.input, preview: action.inputPreview }),
        });

        await appendAegisTrace({
            runId: proposal.runId,
            userId: proposal.userId,
            type: "aegis.approval_required",
            stage: "tools",
            message: "Approval required before editing portfolio cost basis.",
            payload: toJson({ actionId: action.id, approvalId: approval.id }),
        });
    }

    return action;
}

export async function executeAegisAction(actionId: string, userId: string) {
    const action = await getAegisActionForUser(actionId, userId);
    if (!action) throw new Error("Aegis action not found.");
    if (action.status === "succeeded") return action;
    if (action.status === "waiting_approval") throw new Error("Aegis action requires approval before execution.");
    if (action.status === "rejected") throw new Error("Aegis action was rejected.");

    const transition = await markAegisActionRunning(action.id, userId);
    if (transition.count === 0) {
        const latest = await getAegisActionForUser(actionId, userId);
        if (latest?.status === "succeeded") return latest;
        throw new Error("Aegis action is already running or no longer executable.");
    }

    try {
        let output: unknown;
        if (action.tool === "portfolio.read") {
            PortfolioReadActionInputSchema.parse(action.input);
            output = await readAegisPortfolio(userId);
        } else if (action.tool === "watchlist.add") {
            const input = WatchlistAddActionInputSchema.parse(action.input);
            output = await addAegisWatchlistItem(input);
        } else if (action.tool === "portfolio.acquiredPrice.update") {
            const input = UpdateAcquiredPriceActionInputSchema.parse(action.input);
            output = await updateAegisAcquiredPrice(userId, input);
        } else {
            throw new Error("Aegis tool is not allowed.");
        }

        const updated = await updateAegisActionStatus(action.id, userId, "succeeded", {
            output: toJson(output),
            outputPreview: "Aegis action completed successfully.",
        });

        await appendAegisTrace({
            runId: action.runId,
            userId,
            type: "aegis.action_succeeded",
            stage: "tools",
            message: "Aegis action completed successfully.",
            payload: toJson({ actionId: action.id, tool: action.tool, output }),
        });

        if (action.tool === "watchlist.add" || action.tool === "portfolio.acquiredPrice.update") {
            await appendAegisTrace({
                runId: action.runId,
                userId,
                type: "aegis.refetch",
                stage: "tools",
                message: "Refresh affected Aegis data.",
                payload: toJson({ targets: action.tool === "watchlist.add" ? ["watchlist"] : ["portfolio"] }),
            });
        }

        return updated;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Aegis action failed.";
        await updateAegisActionStatus(action.id, userId, "failed", { error: message });
        await appendAegisLog({
            runId: action.runId,
            userId,
            type: "action_error",
            level: "error",
            message,
            error: message,
            payload: toJson({ actionId: action.id, tool: action.tool }),
        });
        await appendAegisTrace({
            runId: action.runId,
            userId,
            type: "aegis.error",
            stage: "tools",
            message,
            error: message,
            payload: toJson({ actionId: action.id, tool: action.tool }),
        });
        throw error;
    }
}
