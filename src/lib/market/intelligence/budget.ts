export interface ScmBudgetState extends Record<string, string | number> {
    scmMinuteStartedAt: string;
    scmMinuteCount: number;
    scmDayStartedAt: string;
    scmDayCount: number;
}

export interface ScmBudgetSummary {
    minuteCount: number;
    dayCount: number;
    hardDailyCap: number;
    cronPerRunCap: number;
    cronDailyBudget: number;
    reserveDailyBudget: number;
    remainingHardBudget: number;
    remainingCronBudget: number;
}

export const SCM_HARD_DAILY_CAP = 950;
export const SCM_MAX_PER_MINUTE = 19;
export const SCM_CRON_PER_RUN_CAP = 3;
export const SCM_FIVE_MINUTE_RUNS_PER_DAY = 288;
export const SCM_CRON_DAILY_BUDGET = SCM_CRON_PER_RUN_CAP * SCM_FIVE_MINUTE_RUNS_PER_DAY;
export const SCM_RESERVE_DAILY_BUDGET = SCM_HARD_DAILY_CAP - SCM_CRON_DAILY_BUDGET;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

export function defaultScmBudget(now: Date): ScmBudgetState {
    return {
        scmMinuteStartedAt: now.toISOString(),
        scmMinuteCount: 0,
        scmDayStartedAt: now.toISOString(),
        scmDayCount: 0,
    };
}

export function normalizeScmBudget(value: unknown, now: Date): ScmBudgetState {
    if (!isRecord(value)) return defaultScmBudget(now);

    const fallback = defaultScmBudget(now);
    const minuteStartedAt = stringValue(value.scmMinuteStartedAt) ?? fallback.scmMinuteStartedAt;
    const dayStartedAt = stringValue(value.scmDayStartedAt) ?? fallback.scmDayStartedAt;
    const minuteStart = new Date(minuteStartedAt);
    const dayStart = new Date(dayStartedAt);
    const minuteFresh = Number.isFinite(minuteStart.getTime()) && now.getTime() - minuteStart.getTime() < 60_000;
    const dayFresh = Number.isFinite(dayStart.getTime()) && now.toISOString().slice(0, 10) === dayStart.toISOString().slice(0, 10);

    return {
        scmMinuteStartedAt: minuteFresh ? minuteStartedAt : now.toISOString(),
        scmMinuteCount: minuteFresh ? numberValue(value.scmMinuteCount) ?? 0 : 0,
        scmDayStartedAt: dayFresh ? dayStartedAt : now.toISOString(),
        scmDayCount: dayFresh ? numberValue(value.scmDayCount) ?? 0 : 0,
    };
}

export function buildScmBudgetSummary(value: unknown, now: Date): ScmBudgetSummary {
    const budget = normalizeScmBudget(value, now);
    return {
        minuteCount: budget.scmMinuteCount,
        dayCount: budget.scmDayCount,
        hardDailyCap: SCM_HARD_DAILY_CAP,
        cronPerRunCap: SCM_CRON_PER_RUN_CAP,
        cronDailyBudget: SCM_CRON_DAILY_BUDGET,
        reserveDailyBudget: SCM_RESERVE_DAILY_BUDGET,
        remainingHardBudget: Math.max(0, SCM_HARD_DAILY_CAP - budget.scmDayCount),
        remainingCronBudget: Math.max(0, SCM_CRON_DAILY_BUDGET - budget.scmDayCount),
    };
}

export function hasScmBudget(value: unknown, now: Date): boolean {
    const budget = normalizeScmBudget(value, now);
    return budget.scmMinuteCount < SCM_MAX_PER_MINUTE && budget.scmDayCount < SCM_HARD_DAILY_CAP;
}
