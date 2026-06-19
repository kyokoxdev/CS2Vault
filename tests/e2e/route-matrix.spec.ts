import { test, expect, type Page, type Route } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const EVIDENCE_DIR = path.join('.sisyphus', 'evidence', 'task-9-final-ui-audit');
const UI_PREFERENCES_STORAGE_KEY = 'cs2vault-ui-preferences';
const AUTH_COOKIE_NAME = 'authjs.session-token';
const BASE_URL = 'http://localhost:3000';
const NOW = '2026-05-18T12:00:00.000Z';
const IMAGE_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

type UiTheme = 'dark' | 'high-contrast';
interface RouteScenario {
    name: string;
    path: string;
    selector: string;
    authenticated: boolean;
    theme: UiTheme;
}

const viewports = [
    { name: 'desktop-1440x900', size: { width: 1440, height: 900 } },
    { name: 'tablet-768x1024', size: { width: 768, height: 1024 } },
    { name: 'pixel-5', size: { width: 393, height: 851 } },
] as const;

const routeScenarios: RouteScenario[] = [
    { name: 'home', path: '/', selector: '[data-testid="route-home"]', authenticated: true, theme: 'dark' },
    { name: 'market-cap', path: '/market-cap', selector: '[data-testid="route-market-cap"]', authenticated: true, theme: 'high-contrast' },
    { name: 'watchlist', path: '/watchlist', selector: '[data-testid="route-watchlist"]', authenticated: true, theme: 'dark' },
    { name: 'portfolio', path: '/portfolio', selector: '[data-testid="route-portfolio"]', authenticated: true, theme: 'high-contrast' },
    { name: 'item-detail', path: '/item/qa-item-1', selector: '[data-testid="route-item-detail"]', authenticated: true, theme: 'dark' },
    { name: 'intelligence', path: '/intelligence', selector: '[data-testid="route-intelligence"]', authenticated: true, theme: 'high-contrast' },
    { name: 'chat', path: '/chat', selector: '[data-testid="route-chat"]', authenticated: true, theme: 'dark' },
    { name: 'settings', path: '/settings', selector: '[data-testid="route-settings"]', authenticated: true, theme: 'high-contrast' },
    { name: 'startup', path: '/startup', selector: '[data-testid="route-startup"]', authenticated: false, theme: 'dark' },
];

const marketItem = {
    id: 'qa-item-1',
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    name: 'AK-47 | Redline',
    weapon: 'AK-47',
    skin: 'Redline',
    category: 'Rifle',
    type: 'Weapon',
    rarity: 'Classified',
    exterior: 'Field-Tested',
    imageUrl: IMAGE_URL,
    isWatched: true,
    isActive: true,
    createdAt: NOW,
    currentPrice: 24.88,
    priceSource: 'qa-fixture',
    lastUpdated: NOW,
    priceChange24h: 4.2,
    sparkline: [
        { time: 1716000000, value: 22.1 },
        { time: 1716086400, value: 23.4 },
        { time: 1716172800, value: 24.88 },
    ],
    notes: 'Task 9 deterministic fixture',
    groups: [{ id: 'qa-group-1', name: 'Blue chips', color: '#3B82F6' }],
};

const portfolioItem = {
    id: 'portfolio-qa-1',
    itemId: marketItem.id,
    assetId: 'asset-qa-1',
    name: marketItem.name,
    marketHashName: marketItem.marketHashName,
    category: marketItem.category,
    type: marketItem.type,
    rarity: marketItem.rarity,
    exterior: marketItem.exterior,
    imageUrl: marketItem.imageUrl,
    currentPrice: marketItem.currentPrice,
    acquiredPrice: 19.5,
    pnl: 5.38,
    pnlPercent: 27.59,
    floatValue: 0.21,
    wearQuality: 'Field-Tested',
    acquiredAt: NOW,
    isWatched: true,
};

const intelligenceSignal = {
    id: 'signal-qa-1',
    itemId: marketItem.id,
    marketHashName: marketItem.marketHashName,
    signalType: 'pump',
    status: 'active',
    confidence: 87,
    detectedAt: NOW,
    lastSeenAt: NOW,
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
};

const intelligenceStatus = {
    initialized: true,
    killSwitch: false,
    circuitBreaker: { active: false, until: null, consecutiveFailures: 0 },
    queue: { pending: 3, running: 0, backoff: 0, disabled: 0, oldestDueAt: NOW, oldestDueAgeMinutes: 12 },
    processed: 4,
    skippedDueToBudget: 0,
    remainingDue: 3,
    lastRunAt: NOW,
    nextRecommendedPingAt: NOW,
    lastError: null,
    scmBudget: {
        minuteCount: 2,
        dayCount: 118,
        hardDailyCap: 950,
        cronPerRunCap: 3,
        cronDailyBudget: 864,
        reserveDailyBudget: 86,
        remainingHardBudget: 832,
        remainingCronBudget: 746,
    },
};

function jsonResponse(route: Route, payload: unknown, status = 200) {
    return route.fulfill({ status, json: payload });
}

function marketCapSeries() {
    return [
        { time: 1716000000, value: 1200000, itemCount: 1 },
        { time: 1716086400, value: 1240000, itemCount: 1 },
        { time: 1716172800, value: 1295000, itemCount: 1 },
    ];
}

function candlesticks() {
    return [
        { time: 1716000000, open: 22.1, high: 23.5, low: 21.9, close: 23.4, volume: 840 },
        { time: 1716086400, open: 23.4, high: 24.9, low: 23.1, close: 24.88, volume: 920 },
        { time: 1716172800, open: 24.88, high: 25.2, low: 24.1, close: 24.6, volume: 760 },
    ];
}

async function addAuthCookie(page: Page) {
    await page.context().addCookies([
        {
            name: AUTH_COOKIE_NAME,
            value: 'qa-session',
            url: BASE_URL,
            httpOnly: true,
            sameSite: 'Lax',
        },
    ]);
}

async function installScenarioPreferences(page: Page, theme: UiTheme) {
    await page.addInitScript(
        ({ key, selectedTheme }) => {
            const preferences = { theme: selectedTheme };

            window.localStorage.setItem(key, JSON.stringify(preferences));
            const root = document.documentElement;
            if (!root) return;
            root.dataset.theme = preferences.theme;
        },
        { key: UI_PREFERENCES_STORAGE_KEY, selectedTheme: theme },
    );
}

async function mockAppApis(page: Page) {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const pathname = url.pathname;

        if (pathname === '/api/auth/session') {
            await jsonResponse(route, {
                user: { name: 'QA Session', email: 'qa@example.test' },
                expires: '2026-06-18T12:00:00.000Z',
            });
            return;
        }

        if (pathname === '/api/items/qa-item-1/prices') {
            await jsonResponse(route, {
                success: true,
                data: {
                    candlesticks: candlesticks(),
                    latestPrice: 24.6,
                    latestTimestamp: NOW,
                    latestSource: 'qa-fixture',
                },
            });
            return;
        }

        if (pathname === '/api/items/qa-item-1') {
            await jsonResponse(route, { success: true, data: marketItem });
            return;
        }

        if (pathname === '/api/items') {
            await jsonResponse(route, {
                success: true,
                data: { items: [marketItem], total: 1, lastPriceUpdate: NOW },
            });
            return;
        }

        if (pathname === '/api/groups') {
            await jsonResponse(route, {
                success: true,
                data: { groups: [{ id: 'qa-group-1', name: 'Blue chips', color: '#3B82F6', sortOrder: 0, _count: { items: 1 } }] },
            });
            return;
        }

        if (pathname === '/api/sync') {
            await jsonResponse(route, {
                success: true,
                data: { logs: [{ id: 1, status: 'success', itemCount: 1, duration: 120, error: null, timestamp: NOW }], lastPriceUpdate: NOW },
            });
            return;
        }

        if (pathname === '/api/market/summary') {
            await jsonResponse(route, {
                success: true,
                data: { marketCapUsd: 1295000, source: 'qa-fixture', sampleSize: 1, computedAt: NOW, status: 'ok' },
            });
            return;
        }

        if (pathname === '/api/market/market-cap/history') {
            await jsonResponse(route, {
                success: true,
                data: { series: marketCapSeries(), count: 3, latest: { totalMarketCap: 1295000, itemCount: 1, timestamp: NOW } },
            });
            return;
        }

        if (pathname === '/api/market/market-cap') {
            await jsonResponse(route, {
                success: true,
                status: 'ok',
                data: { totalMarketCap: 1295000, itemCount: 1, provider: 'qa-fixture', source: 'qa-fixture', timestamp: NOW },
            });
            return;
        }

        if (pathname === '/api/market/top-movers') {
            await jsonResponse(route, {
                success: true,
                data: {
                    source: 'qa-fixture',
                    gainers: [{ id: marketItem.id, name: marketItem.name, price: 24.88, change24h: 4.2, sparkline: marketItem.sparkline }],
                    losers: [],
                },
            });
            return;
        }

        if (pathname === '/api/market/news-feed') {
            await jsonResponse(route, {
                success: true,
                data: { items: [{ id: 'news-qa-1', title: 'QA market update', link: 'https://example.test/news', source: 'QA Feed', publishedAt: NOW }] },
            });
            return;
        }

        if (pathname === '/api/watchlist/prices') {
            await jsonResponse(route, { success: true, data: { itemCount: 1, fallbackAvailable: false, failureReason: null } });
            return;
        }

        if (pathname === '/api/portfolio') {
            await jsonResponse(route, {
                success: true,
                data: {
                    totalCurrentValue: 24.88,
                    totalAcquiredValue: 19.5,
                    hasAnyCostBasis: true,
                    unrealizedPnL: 5.38,
                    unrealizedPnLPercent: 27.59,
                    itemCount: 1,
                    items: [portfolioItem],
                    filterOptions: { categories: ['Rifle'], rarities: ['Classified'] },
                    lastPriceUpdate: NOW,
                },
            });
            return;
        }

        if (pathname === '/api/portfolio/sold') {
            await jsonResponse(route, {
                success: true,
                data: { totalSoldValue: 0, totalAcquiredValue: 0, hasAnyCostBasis: false, totalRealizedPnL: 0, realizedPnLPercent: null, soldCount: 0, items: [] },
            });
            return;
        }

        if (pathname === '/api/portfolio/prices' || pathname === '/api/inventory') {
            await jsonResponse(route, {
                success: true,
                data: { pricedCount: 1, priceSource: 'qa-fixture', priceCoverage: { total: 1, priced: 1, candidates: 1 }, priceSkippedRecent: 0, priceLimitedTo: null, fallbackAvailable: false, failureReason: null, attemptedProvider: null, synced: 1 },
            });
            return;
        }

        if (pathname === '/api/intelligence/signals') {
            await jsonResponse(route, {
                success: true,
                data: { items: [intelligenceSignal], meta: { total: 1, hasMore: false, nextCursor: null, filters: {} } },
            });
            return;
        }

        if (pathname === '/api/intelligence/status') {
            await jsonResponse(route, { success: true, data: intelligenceStatus });
            return;
        }

        if (pathname === '/api/chat/sessions') {
            await jsonResponse(route, {
                success: true,
                data: [{ id: 'chat-qa-1', title: 'QA Chat', createdAt: NOW, updatedAt: NOW, _count: { messages: 1 } }],
            });
            return;
        }

        if (pathname === '/api/chat/history') {
            await jsonResponse(route, { success: true, data: [{ role: 'assistant', content: 'Task 9 chat fixture ready.' }] });
            return;
        }

        if (pathname === '/api/settings') {
            await jsonResponse(route, {
                activeMarketSource: 'csfloat',
                activeAIProvider: 'gemini-flash',
                priceRefreshIntervalMin: 10,
                openAiApiKey: '',
                geminiApiKey: '',
                anthropicApiKey: '',
                openRouterApiKey: '',
                nineRouterApiKey: '',
                csfloatApiKey: '',
                csgotraderSubProvider: 'csfloat',
            });
            return;
        }

        await jsonResponse(route, { success: true, data: {} });
    });
}

async function expectReducedMotionStatic(page: Page) {
    await expect(page.locator('html')).not.toHaveAttribute('data-motion');

    const tickerAnimation = await page.locator('[data-testid="shell-market-ticker"]').evaluate((ticker) => {
        const track = ticker.querySelector('div > div');
        if (!(track instanceof HTMLElement)) {
            return 'missing';
        }

        const style = window.getComputedStyle(track);
        return style.animationName;
    });
    expect(tickerAnimation, 'Shell market ticker should not actively animate under reduced motion').toBe('none');

    const radar = page.locator('[data-testid="intelligence-radar"]');
    await expect(radar).toHaveAttribute('data-reduced-motion', 'true');
    await expect(page.locator('[data-testid="intelligence-radar-sweep"]')).toHaveCount(0);

    const pointAnimations = await radar.locator('button[aria-label*="signal"]').evaluateAll((points) => (
        points.map((point) => window.getComputedStyle(point).animationName)
    ));
    expect(pointAnimations.length).toBeGreaterThan(0);
    expect(
        pointAnimations.every((animationName) => animationName === 'none'),
        'Intelligence radar points should not actively animate under reduced motion',
    ).toBeTruthy();
}

test.describe('Task 9 final route screenshot matrix', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(async ({}, workerInfo) => {
        if (workerInfo.project.name === 'chromium') {
            fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        }
    });

    test.beforeEach(async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'Route matrix sets desktop, tablet, and Pixel 5 viewports explicitly in Chromium.');
        await mockAppApis(page);
    });

    for (const scenario of routeScenarios) {
        test(`captures ${scenario.name} across desktop, tablet, Pixel 5, theme, and reduced-motion state`, async ({ page }, testInfo) => {
            testInfo.setTimeout(60000);
            await installScenarioPreferences(page, scenario.theme);

            const browserIssues: string[] = [];
            page.on('console', (message) => {
                if (message.type() === 'error') {
                    browserIssues.push(`console error: ${message.text()}`);
                }
            });
            page.on('pageerror', (error) => browserIssues.push(`page error: ${error.message}`));

            for (const viewport of viewports) {
                await page.context().clearCookies();
                if (scenario.authenticated) {
                    await addAuthCookie(page);
                }

                const reducedMotion = scenario.name === 'intelligence' && viewport.name === 'desktop-1440x900';

                await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
                await page.setViewportSize(viewport.size);
                await page.goto(scenario.path, { waitUntil: 'domcontentloaded' });
                await expect(page.locator(scenario.selector)).toBeVisible({ timeout: 15000 });
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

                if (scenario.name === 'intelligence') {
                    await expect(page.locator('[data-testid="intelligence-dashboard"]')).toBeVisible();
                }

                await expect(page.locator('html')).toHaveAttribute('data-theme', scenario.theme);
                if (reducedMotion) {
                    await expectReducedMotionStatic(page);
                }

                await page.screenshot({
                    path: path.join(EVIDENCE_DIR, `${scenario.name}-${viewport.name}.png`),
                    fullPage: true,
                });
            }

            expect(browserIssues, `${scenario.name} should not surface browser page errors`).toEqual([]);
        });
    }
});
