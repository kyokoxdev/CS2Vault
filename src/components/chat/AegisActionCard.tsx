import { useEffect, useMemo, useState } from "react";
import { FaCheck, FaExclamationTriangle, FaRedo, FaTimes } from "react-icons/fa";
import type { AegisClientStreamEvent } from "./aegisStream";
import styles from "./AIChat.module.css";

type ApprovalDecision = "approve" | "reject";
type PersistedActionStatus = "proposed" | "waiting_approval" | "approved" | "rejected" | "running" | "succeeded" | "failed";
type PersistedApprovalStatus = "pending" | "approved" | "rejected";

interface AegisActionCardProps {
    event: AegisClientStreamEvent;
    onRefetch?: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getStringArray(record: Record<string, unknown>, key: string): string[] {
    const value = record[key];
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function getActionStatus(record: Record<string, unknown> | null): PersistedActionStatus | undefined {
    const value = record?.actionStatus;
    if (
        value === "proposed"
        || value === "waiting_approval"
        || value === "approved"
        || value === "rejected"
        || value === "running"
        || value === "succeeded"
        || value === "failed"
    ) {
        return value;
    }

    return undefined;
}

function getApprovalStatus(record: Record<string, unknown> | null): PersistedApprovalStatus | undefined {
    const value = record?.approvalStatus;
    if (value === "pending" || value === "approved" || value === "rejected") {
        return value;
    }

    return undefined;
}

function getPersistedDecision(actionStatus: PersistedActionStatus | undefined, approvalStatus: PersistedApprovalStatus | undefined): ApprovalDecision | null {
    if (approvalStatus === "rejected" || actionStatus === "rejected") {
        return "reject";
    }

    if (approvalStatus === "approved" || actionStatus === "approved" || actionStatus === "running" || actionStatus === "succeeded") {
        return "approve";
    }

    return null;
}

function toDisplayJson(value: unknown): string | null {
    if (value === undefined) {
        return null;
    }

    try {
        const serialized = JSON.stringify(value, null, 2);
        return serialized.length > 900 ? `${serialized.slice(0, 900)}\n…` : serialized;
    } catch (error) {
        console.warn("[AegisActionCard] Failed to serialize action details", error);
        return null;
    }
}

export function AegisActionCard({ event, onRefetch }: AegisActionCardProps) {
    const payload = useMemo(() => (isRecord(event.payload) ? event.payload : null), [event.payload]);
    const [approvalPending, setApprovalPending] = useState(false);
    const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
    const [approvalError, setApprovalError] = useState<string | null>(null);
    const [resolvedDecision, setResolvedDecision] = useState<ApprovalDecision | null>(null);
    const [refetchFeedback, setRefetchFeedback] = useState<string | null>(null);

    const actionId = payload ? getString(payload, "actionId") : undefined;
    const tool = payload ? getString(payload, "tool") : undefined;
    const risk = payload ? getString(payload, "risk") : undefined;
    const targets = payload ? getStringArray(payload, "targets") : [];
    const inputPreview = payload && "input" in payload ? payload.input : undefined;
    const outputPreview = payload && "output" in payload ? payload.output : undefined;
    const actionStatus = getActionStatus(payload);
    const approvalStatus = getApprovalStatus(payload);
    const message = event.error ?? event.message ?? "Aegis emitted an event without a message.";
    const stageLabel = event.stage ? event.stage.replace(/[-_]+/g, " ") : null;
    const detailJson = toDisplayJson(
        event.type === "aegis.action_succeeded"
            ? outputPreview
            : event.type === "aegis.action_preview"
                ? inputPreview
                : event.payload
    );

    const cardToneClassName = event.type === "aegis.error"
        ? styles.aegisActionCardError
        : event.type === "aegis.action_succeeded"
            ? styles.aegisActionCardSuccess
            : event.type === "aegis.approval_required"
                ? styles.aegisActionCardApproval
                : styles.aegisActionCardNeutral;

    const title = event.type === "aegis.action_preview"
        ? "Action Preview"
        : event.type === "aegis.approval_required"
            ? "Approval Required"
            : event.type === "aegis.action_succeeded"
                ? "Action Succeeded"
                : event.type === "aegis.refetch"
                    ? "Refresh Suggested"
                    : "Action Error";

    useEffect(() => {
        setResolvedDecision(getPersistedDecision(actionStatus, approvalStatus));
    }, [actionStatus, approvalStatus]);

    const approvalLocked = resolvedDecision !== null || actionStatus === "succeeded" || actionStatus === "running";

    const handleApproval = async (decision: ApprovalDecision) => {
        if (!actionId || approvalPending) {
            return;
        }

        setApprovalPending(true);
        setApprovalError(null);
        setApprovalFeedback(null);

        try {
            const res = await fetch(`/api/aegis/actions/${encodeURIComponent(actionId)}/${decision === "approve" ? "approve" : "reject"}`, {
                method: "POST",
            });
            let data: { success?: boolean; error?: string } | null = null;
            try {
                data = await res.json() as { success?: boolean; error?: string };
            } catch (error) {
                console.warn("[AegisActionCard] Failed to parse approval response", error);
            }

            if (!res.ok || !data?.success) {
                throw new Error(data?.error || `Failed to ${decision} Aegis action.`);
            }

            setResolvedDecision(decision);
            setApprovalFeedback(decision === "approve"
                ? "Approved. Aegis executed this action."
                : "Rejected. Aegis will not execute this action.");
            if (decision === "approve") {
                onRefetch?.();
            }
        } catch (error) {
            setApprovalError(error instanceof Error ? error.message : "Failed to update Aegis approval.");
        } finally {
            setApprovalPending(false);
        }
    };

    const handleRefetch = () => {
        onRefetch?.();
        setRefetchFeedback("Refresh triggered.");
    };

    return (
        <section className={`${styles.aegisActionCard} ${cardToneClassName}`} aria-label={title}>
            <div className={styles.aegisActionCardHeader}>
                <div>
                    <p className={styles.aegisActionCardEyebrow}>{title}</p>
                    <p className={styles.aegisActionCardMessage}>{message}</p>
                </div>
                {stageLabel ? <span className={styles.aegisActionStage}>{stageLabel}</span> : null}
            </div>

            {(tool || risk || actionId) && (
                <div className={styles.aegisActionMetaRow}>
                    {tool ? <span className={styles.aegisActionBadge}>{tool}</span> : null}
                    {risk ? <span className={styles.aegisActionBadge}>{risk} risk</span> : null}
                    {actionStatus ? <span className={styles.aegisActionBadge}>{actionStatus.replace(/_/g, " ")}</span> : null}
                    {actionId ? <span className={styles.aegisActionMetaText}>ID {actionId.slice(0, 8)}</span> : null}
                </div>
            )}

            {detailJson ? (
                <pre className={styles.aegisActionPre} aria-label="Aegis action details">
                    <code>{detailJson}</code>
                </pre>
            ) : null}

            {event.type === "aegis.approval_required" ? (
                <>
                    <div className={styles.aegisActionControls}>
                        <button
                            type="button"
                            className={`${styles.aegisActionButton} ${styles.aegisActionApprove}`}
                            onClick={() => void handleApproval("approve")}
                            disabled={!actionId || approvalPending || approvalLocked}
                            aria-label="Approve Aegis action"
                        >
                            <FaCheck aria-hidden="true" />
                            <span>{approvalPending ? "Working..." : resolvedDecision === "approve" ? "Approved" : "Approve"}</span>
                        </button>
                        <button
                            type="button"
                            className={`${styles.aegisActionButton} ${styles.aegisActionReject}`}
                            onClick={() => void handleApproval("reject")}
                            disabled={!actionId || approvalPending || approvalLocked}
                            aria-label="Reject Aegis action"
                        >
                            <FaTimes aria-hidden="true" />
                            <span>{resolvedDecision === "reject" ? "Rejected" : "Reject"}</span>
                        </button>
                    </div>
                    {!actionId ? <p className={styles.aegisActionWarning}>Missing action id. This approval cannot be sent.</p> : null}
                    {approvalFeedback ? <p className={styles.aegisActionSuccessText}>{approvalFeedback}</p> : null}
                    {approvalError ? <p className={styles.aegisActionErrorText}>{approvalError}</p> : null}
                </>
            ) : null}

            {event.type === "aegis.refetch" ? (
                <>
                    {targets.length > 0 ? <p className={styles.aegisActionMetaText}>Targets: {targets.join(", ")}</p> : null}
                    <div className={styles.aegisActionControls}>
                        <button
                            type="button"
                            className={styles.aegisActionButton}
                            onClick={handleRefetch}
                            aria-label="Refresh Aegis data"
                        >
                            <FaRedo aria-hidden="true" />
                            <span>Refresh now</span>
                        </button>
                    </div>
                    {refetchFeedback ? <p className={styles.aegisActionSuccessText}>{refetchFeedback}</p> : null}
                </>
            ) : null}

            {event.type === "aegis.error" && event.error ? (
                <p className={styles.aegisActionErrorText}>
                    <FaExclamationTriangle aria-hidden="true" />
                    <span>{event.error}</span>
                </p>
            ) : null}
        </section>
    );
}
