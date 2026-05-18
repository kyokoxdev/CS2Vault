"use client";

import { Badge } from "@/components/ui/Badge";
import type { IntelligenceSignal } from "./types";
import styles from "./SignalCard.module.css";

interface SignalCardProps {
  signal: IntelligenceSignal;
  referenceTimeMs: number;
}

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDeltaCents(delta: number | null, baseline: number | null): string | null {
  if (delta === null || baseline === null || baseline === 0) return null;
  const pct = ((delta / baseline) * 100).toFixed(1);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function formatRelativeTime(ts: string | null, referenceMs: number): string {
  if (!ts) return "—";
  const diffMs = referenceMs - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function getFreshnessVariant(freshness: string): "success" | "warning" | "danger" | "neutral" {
  if (freshness === "fresh") return "success";
  if (freshness === "stale") return "warning";
  if (freshness === "expired") return "danger";
  return "neutral";
}

function getConfidenceVariant(confidence: number): "success" | "warning" | "danger" | "neutral" {
  if (confidence >= 80) return "success";
  if (confidence >= 50) return "warning";
  return "danger";
}

function getSignalTypeBadgeVariant(signalType: string): "info" | "neutral" | "warning" | "danger" | "success" {
  const map: Record<string, "info" | "neutral" | "warning" | "danger" | "success"> = {
    pump: "success",
    accumulation: "info",
    dump: "danger",
    neutral: "neutral",
  };
  return map[signalType] ?? "neutral";
}

function formatReason(reason: unknown): string {
  if (typeof reason === "string") return reason;

  if (reason && typeof reason === "object") {
    const candidate = reason as { label?: unknown; code?: unknown };
    if (typeof candidate.label === "string") return candidate.label;
    if (typeof candidate.code === "string") return candidate.code;
  }

  try {
    return JSON.stringify(reason) ?? "Unknown reason";
  } catch {
    return "Unknown reason";
  }
}

export function SignalCard({ signal, referenceTimeMs }: SignalCardProps) {
  const deltaPct = formatDeltaCents(signal.deltaCents, signal.baselineCents);

  return (
    <div className={styles.card} data-testid="signal-card">
      <div className={styles.cardHeader}>
        <span className={styles.itemName} title={signal.marketHashName ?? undefined}>
          {signal.marketHashName ?? "Unknown Item"}
        </span>
        <div className={styles.badgeRow}>
          <Badge variant={getSignalTypeBadgeVariant(signal.signalType)} size="sm">
            {signal.signalType.charAt(0).toUpperCase() + signal.signalType.slice(1).replace(/_/g, " ")}
          </Badge>
          {signal.tier && (
            <Badge variant={signal.tier === "liquid" ? "success" : signal.tier === "low_supply_discontinued" ? "danger" : "neutral"} size="sm">
              {signal.tier === "low_supply_discontinued" ? "Low-supply / discontinued" : signal.tier.charAt(0).toUpperCase() + signal.tier.slice(1)}
            </Badge>
          )}
          <Badge variant={getFreshnessVariant(signal.freshness)} size="sm">
            {signal.freshness}
          </Badge>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>Confidence</span>
          <span className={styles.metricValue} data-testid="confidence-badge">
            <Badge variant={getConfidenceVariant(signal.confidence)} size="sm">
              {signal.confidence}%
            </Badge>
          </span>
        </div>

        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>Price</span>
          <span className={styles.metricValue}>{formatCents(signal.priceCents)}</span>
        </div>

        {signal.baselineCents !== null && (
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Baseline</span>
            <span className={styles.metricValue}>{formatCents(signal.baselineCents)}</span>
          </div>
        )}

        {deltaPct !== null && (
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Delta</span>
            <span className={`${styles.metricValue} ${(signal.deltaCents ?? 0) > 0 ? styles.positive : (signal.deltaCents ?? 0) < 0 ? styles.negative : ""}`}>
              {deltaPct}
            </span>
          </div>
        )}

        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>SCM Median</span>
          <span className={styles.metricValue}>{formatCents(signal.scmMedianCents ?? null)}</span>
        </div>

        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>SCM Volume</span>
          <span className={styles.metricValue}>{signal.scmVolume != null ? signal.scmVolume.toLocaleString() : "—"}</span>
        </div>

        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>CSFloat Floor</span>
          <span className={styles.metricValue}>{formatCents(signal.csfloatFloorCents ?? null)}</span>
        </div>

        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>CSFloat Supply</span>
          <span className={styles.metricValue}>{signal.csfloatSupply != null ? signal.csfloatSupply.toLocaleString() : "—"}</span>
        </div>

        {signal.reasons && signal.reasons.length > 0 && (
          <div className={styles.reasonsRow}>
            {signal.reasons.map((reason, i) => (
              <span key={i} className={styles.reasonTag}>
                {formatReason(reason)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.cardFooter}>
        <span className={styles.timestamp}>Detected {formatRelativeTime(signal.detectedAt, referenceTimeMs)}</span>
        {signal.lastSeenAt && (
          <span className={styles.timestamp}>Last seen {formatRelativeTime(signal.lastSeenAt, referenceTimeMs)}</span>
        )}
      </div>
    </div>
  );
}
