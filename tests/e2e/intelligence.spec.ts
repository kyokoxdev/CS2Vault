import { test, expect, type Page, type Route } from '@playwright/test';
import path from 'path';

const EVIDENCE_DIR = '.sisyphus/evidence';

const VIEWPORTS = {
    mobile: { width: 375, height: 667 },
    desktop: { width: 1440, height: 900 },
};

interface MockSignal {
    id: string;
    itemId: string;
    marketHashName: string;
    signalType: string;
    status: string;
    confidence: number;
    detectedAt: string;
    lastSeenAt: string | null;
    staleAt: string | null;
    priceCents: number | null;
    baselineCents: number | null;
    deltaCents: number | null;
    reasons: string[];
    freshness: string;
    tier: string;
    scmMedianCents: number | null;
    scmVolume: number | null;
    csfloatFloorCents: number | null;
    csfloatSupply: number | null;
}

interface MockStatus {
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

interface MockApiOptions {
    signals?: MockSignal[];
    status?: MockStatus;
    signalsFailure?: string;
    captureActions?: string[];
}

const now = new Date('2026-05-18T12:00:00.000Z');
const recentTime = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
const staleTime = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
const backoffUntil = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

const baseSignals: MockSignal[] = [
    {
        id: 'signal-pump-1',
        itemId: 'item-1',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        signalType: 'pump',
        status: 'active',
        confidence: 87,
        detectedAt: recentTime,
        lastSeenAt: recentTime,
        staleAt: null,
        priceCents: 2488,
        baselineCents: 1984,
        deltaCents: 504,
        reasons: ['Price is 25.4% above baseline', 'Volume trend is rising'],
        freshness: 'fresh',
        tier: 'liquid',
        scmMedianCents: 2450,
        scmVolume: 842,
        csfloatFloorCents: 2399,
        csfloatSupply: 1280,
    },
    {
        id: 'signal-accumulation-1',
        itemId: 'item-2',
        marketHashName: 'Operation Breakout Weapon Case',
        signalType: 'accumulation',
        status: 'active',
        confidence: 74,
        detectedAt: staleTime,
        lastSeenAt: staleTime,
        staleAt: staleTime,
        priceCents: 812,
        baselineCents: 794,
        deltaCents: 18,
        reasons: ['Volume is 3.1x moving average', 'Price remains within accumulation band'],
        freshness: 'stale',
        tier: 'low_supply_discontinued',
        scmMedianCents: 808,
        scmVolume: 93,
        csfloatFloorCents: 801,
        csfloatSupply: 76,
    },
    {
        id: 'signal-dump-1',
        itemId: 'item-3',
        marketHashName: 'M4A1-S | Cyrex (Minimal Wear)',
        signalType: 'dump',
        status: 'active',
        confidence: 61,
        detectedAt: recentTime,
        lastSeenAt: recentTime,
        staleAt: null,
        priceCents: 1795,
        baselineCents: 2320,
        deltaCents: -525,
        reasons: ['Price is below recent peak', 'Sell pressure elevated'],
        freshness: 'fresh',
        tier: 'standard',
        scmMedianCents: 1810,
        scmVolume: 214,
        csfloatFloorCents: 1765,
        csfloatSupply: 455,
    },
];

const activeStatus: MockStatus = {
    initialized: true,
    killSwitch: false,
    circuitBreaker: { active: false, until: null, consecutiveFailures: 0 },
    queue: {
        pending: 12,
        running: 1,
        backoff: 0,
        disabled: 2,
        oldestDueAt: staleTime,
        oldestDueAgeMinutes: 240,
    },
    processed: null,
    skippedDueToBudget: 0,
    remainingDue: 12,
    lastRunAt: recentTime,
    nextRecommendedPingAt: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
    lastError: null,
};

const backoffStatus: MockStatus = {
    ...activeStatus,
    killSwitch: false,
    circuitBreaker: { active: true, until: backoffUntil, consecutiveFailures: 3 },
    queue: {
        pending: 4,
        running: 0,
        backoff: 6,
        disabled: 2,
        oldestDueAt: staleTime,
        oldestDueAgeMinutes: 240,
    },
    remainingDue: 10,
    nextRecommendedPingAt: null,
    lastError: 'SCM provider returned repeated 429 responses',
};

const pausedStatus: MockStatus = {
    ...activeStatus,
    killSwitch: true,
    circuitBreaker: { active: false, until: null, consecutiveFailures: 0 },
    nextRecommendedPingAt: null,
};

function signalsPayload(signals: MockSignal[], url: string) {
    const parsed = new URL(url);
    const signalType = parsed.searchParams.get('signalType');
    const tier = parsed.searchParams.get('tier');
    const freshness = parsed.searchParams.get('freshness');
    const filtered = signals.filter((signal) => {
        if (signalType && signal.signalType !== signalType) return false;
        if (tier && signal.tier !== tier) return false;
        if (freshness && signal.freshness !== freshness) return false;
        return true;
    });

    return {
        success: true,
        data: {
            items: filtered,
            meta: {
                total: filtered.length,
                hasMore: false,
                nextCursor: null,
                filters: {
                    signalType,
                    tier,
                    freshness,
                },
            },
        },
    };
}

async function addAuthCookie(page: Page) {
    await page.context().addCookies([
        {
            name: 'authjs.session-token',
            value: 'qa-session',
            url: 'http://localhost:3000',
            httpOnly: true,
            sameSite: 'Lax',
        },
    ]);
}

async function parsePostAction(route: Route): Promise<string> {
    const body = route.request().postData();
    if (!body) return '';
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'action' in parsed) {
        const action = parsed.action;
        return typeof action === 'string' ? action : '';
    }
    return '';
}

async function mockIntelligenceApi(page: Page, options: MockApiOptions = {}) {
    let currentStatus = options.status ?? activeStatus;
    const signals = options.signals ?? baseSignals;

    await page.route('**/api/intelligence**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname === '/api/intelligence/signals') {
            if (options.signalsFailure) {
                await route.fulfill({
                    status: 500,
                    json: { success: false, status: 'error', error: options.signalsFailure },
                });
                return;
            }

            await route.fulfill({ json: signalsPayload(signals, request.url()) });
            return;
        }

        if (url.pathname === '/api/intelligence/status' && request.method() === 'POST') {
            const action = await parsePostAction(route);
            options.captureActions?.push(action);
            currentStatus = action === 'pause' ? pausedStatus : activeStatus;
            await route.fulfill({ json: { success: true, data: currentStatus } });
            return;
        }

        if (url.pathname === '/api/intelligence/status') {
            await route.fulfill({ json: { success: true, data: currentStatus } });
            return;
        }

        await route.fulfill({ status: 404, json: { success: false, error: 'Unexpected intelligence test route' } });
    });
}

async function gotoIntelligence(page: Page) {
    await page.goto('/intelligence', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="intelligence-dashboard"]')).toBeVisible();
}

test.describe('Intelligence Dashboard E2E Tests', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async ({}, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'Intelligence E2E sets explicit desktop and mobile viewports in Chromium.');
    });

    test('should display populated signals, filter to Pump, and capture desktop evidence', async ({ page }) => {
        await page.setViewportSize(VIEWPORTS.desktop);
        await addAuthCookie(page);
        await mockIntelligenceApi(page);

        await gotoIntelligence(page);

        await expect(page).toHaveURL(/\/intelligence/);

        const signalCards = page.locator('[data-testid="signal-card"]');
        await expect(signalCards).toHaveCount(3);

        const confidenceBadges = page.locator('[data-testid="confidence-badge"]');
        const confidenceCount = await confidenceBadges.count();
        expect(confidenceCount).toBeGreaterThan(0);
        for (let i = 0; i < confidenceCount; i++) {
            const text = (await confidenceBadges.nth(i).textContent())?.trim() ?? '';
            const value = Number(text.replace('%', ''));
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(100);
        }

        await expect(page.locator('[data-testid="stale-warning"]')).toBeVisible();

        await page.locator('#signal-type-filter').selectOption('pump');
        await expect(signalCards).toHaveCount(1);
        await expect(signalCards.first()).toContainText('AK-47 | Redline');
        await expect(page.locator('#signal-type-filter')).toHaveValue('pump');

        await page.screenshot({
            path: path.join(EVIDENCE_DIR, 'task-11-intelligence-dashboard.png'),
            fullPage: true,
        });
    });

    test('should show mobile stale and backoff state without horizontal overflow', async ({ page }) => {
        await page.setViewportSize(VIEWPORTS.mobile);
        await addAuthCookie(page);
        await mockIntelligenceApi(page, { signals: [baseSignals[1]], status: backoffStatus });

        await gotoIntelligence(page);

        await expect(page.locator('[data-testid="signal-card"]')).toHaveCount(1);
        await expect(page.locator('[data-testid="stale-warning"]')).toBeVisible();
        await expect(page.locator('[data-testid="circuit-breaker-warning"]')).toBeVisible();

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        expect(overflow).toBeFalsy();

        await page.screenshot({
            path: path.join(EVIDENCE_DIR, 'task-11-intelligence-mobile-backoff.png'),
            fullPage: true,
        });
    });

    test('should show empty state when signals API returns no items', async ({ page }) => {
        await addAuthCookie(page);
        await mockIntelligenceApi(page, { signals: [] });

        await gotoIntelligence(page);

        await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
        await expect(page.locator('[data-testid="signal-card"]')).toHaveCount(0);
    });

    test('should show error banner when signals API fails', async ({ page }) => {
        await addAuthCookie(page);
        await mockIntelligenceApi(page, { signalsFailure: 'Failed to fetch intelligence signals' });

        await gotoIntelligence(page);

        await expect(page.locator('[data-testid="error-banner"]')).toBeVisible();
        await expect(page.locator('[data-testid="error-banner"]')).toContainText('Failed to fetch intelligence signals');
    });

    test('should pause and resume status flow when queue controls are visible', async ({ page }) => {
        const capturedActions: string[] = [];

        await addAuthCookie(page);
        await mockIntelligenceApi(page, { captureActions: capturedActions });

        await gotoIntelligence(page);

        const queuePanel = page.locator('[data-testid="queue-status-panel"]');
        await expect(queuePanel).toBeVisible();

        await page.getByRole('button', { name: 'Pause signal processing' }).click();
        await expect(page.locator('[data-testid="kill-switch-warning"]')).toBeVisible();
        expect(capturedActions).toEqual(['pause']);

        await page.getByRole('button', { name: 'Resume signal processing' }).click();
        await expect(page.locator('[data-testid="kill-switch-warning"]')).toHaveCount(0);
        expect(capturedActions).toEqual(['pause', 'resume']);
    });
});
