export interface IntelligenceSignal {
  id: string;
  itemId: string;
  marketHashName: string | null;
  signalType: string;
  status: string;
  confidence: number;
  detectedAt: string;
  lastSeenAt: string | null;
  staleAt: string | null;
  priceCents: number | null;
  baselineCents: number | null;
  deltaCents: number | null;
  reasons: unknown[];
  freshness: string;
  tier: string | null;
  scmMedianCents?: number | null;
  scmVolume?: number | null;
  csfloatFloorCents?: number | null;
  csfloatSupply?: number | null;
}

export interface IntelligenceSignalsResponse {
  success: boolean;
  data?: {
    items: IntelligenceSignal[];
    meta: {
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
      filters: {
        signalType: string | null;
        tier: string | null;
        freshness: string | null;
      };
    };
  };
  error?: string;
}

export interface IntelligenceStatus {
  initialized: boolean;
  killSwitch: boolean;
  circuitBreaker: {
    active: boolean;
    until: string | null;
    consecutiveFailures: number;
  };
  queue: {
    pending: number;
    running: number;
    backoff: number;
    disabled: number;
    oldestDueAt: string | null;
    oldestDueAgeMinutes: number | null;
  };
  processed: number | null;
  skippedDueToBudget: number | null;
  remainingDue: number;
  lastRunAt: string | null;
  nextRecommendedPingAt: string | null;
  lastError: string | null;
}

export interface IntelligenceStatusResponse {
  success: boolean;
  data?: IntelligenceStatus;
  error?: string;
}

export interface SignalFilters {
  signalType: string;
  tier: string;
  freshness: string;
}