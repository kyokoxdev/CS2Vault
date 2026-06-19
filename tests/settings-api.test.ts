/**
 * Unit Tests: Settings API
 * Tests auth guard, API key masking, and Zod validation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Mock Prisma
vi.mock("@/lib/db", () => ({
    prisma: {
        user: {
            findFirst: vi.fn(),
        },
        appSettings: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

vi.mock("@/lib/auth/guard", () => ({
    requireAuth: vi.fn(),
}));

// Mock revalidatePath
vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guard";
import { GET, PATCH } from "@/app/api/settings/route";

interface MockAppSettings {
    id: string;
    activeMarketSource: string;
    activeAIProvider: string;
    openAiApiKey: string | null;
    geminiApiKey: string | null;
    anthropicApiKey: string | null;
    openRouterApiKey: string | null;
    nineRouterApiKey: string | null;
    csfloatApiKey: string | null;
    csgotraderSubProvider: string | null;
    priceRefreshIntervalMin: number;
    watchlistOnly: boolean;
    googleAccessToken: string | null;
    googleRefreshToken: string | null;
    googleTokenExpiry: Date | null;
    syncInProgress: boolean;
    syncStartedAt: Date | null;
}

// Helper to create mock settings with all required fields
const createMockSettings = (overrides: Partial<MockAppSettings> = {}): MockAppSettings => ({
    id: "singleton",
    activeMarketSource: "csfloat",
    activeAIProvider: "gemini-flash",
    openAiApiKey: null,
    geminiApiKey: null,
    anthropicApiKey: null,
    openRouterApiKey: null,
    nineRouterApiKey: null,
    csfloatApiKey: null,
    csgotraderSubProvider: "csfloat",
    priceRefreshIntervalMin: 15,
    watchlistOnly: false,
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiry: null,
    syncInProgress: false,
    syncStartedAt: null,
    ...overrides,
});

// Helper to create mock session
const createMockSession = (userId: string) => ({
    user: { id: userId, steamId: "76561198000000000", name: "Test User" },
    expires: new Date(Date.now() + 86400000).toISOString(),
});

const createUnauthResult = () => ({
    session: null,
    error: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
    ),
});

describe("Settings API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: no session (unauthenticated)
        vi.mocked(requireAuth).mockResolvedValue(createUnauthResult());
    });

    describe("Auth Guard", () => {
        it("GET returns 401 when not authenticated in production", async () => {
            vi.mocked(requireAuth).mockResolvedValue(createUnauthResult());
            const response = await GET();
            expect(response.status).toBe(401);
        });

        it("PATCH returns 401 when not authenticated", async () => {
            vi.mocked(requireAuth).mockResolvedValue(createUnauthResult());
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(null);

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ activeAIProvider: "openai" }),
            });

            const response = await PATCH(request);
            expect(response.status).toBe(401);
        });

        it("GET allows authenticated users", async () => {
            vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-123"), error: null });
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(null);

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.activeAIProvider).toBe("gemini-flash");
        });
    });

    describe("API Key Masking", () => {
        it("masks API keys in GET response", async () => {
            vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-123"), error: null });

            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-1234567890abcdef1234567890abcdef",
                    geminiApiKey: "AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz",
                    anthropicApiKey: "sk-ant-api03-1234567890abcdef",
                    openRouterApiKey: "sk-or-v1-1234567890abcdef",
                    nineRouterApiKey: "nine-router-secret-1234567890",
                    csfloatApiKey: null,
                })
            );

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            // Keys should be masked
            expect(data.openAiApiKey).toBe("sk-1...cdef");
            expect(data.geminiApiKey).toBe("AIza...WxYz");
            expect(data.anthropicApiKey).toBe("sk-a...cdef");
            expect(data.openRouterApiKey).toBe("sk-o...cdef");
            expect(data.nineRouterApiKey).toBe("nine...7890");
            expect(data.csfloatApiKey).toBe("");
        });

        it("masks API keys in PATCH response", async () => {
            vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-123"), error: null });
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(null);

            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    activeAIProvider: "anthropic",
                    anthropicApiKey: "sk-ant-api03-newkey1234567890abcdef",
                })
            );

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ activeAIProvider: "anthropic" }),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.anthropicApiKey).toBe("sk-a...cdef");
        });
    });

    describe("Zod Validation", () => {
        beforeEach(() => {
            vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-123"), error: null });
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(null);
        });

        it("rejects invalid activeAIProvider values", async () => {
            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ activeAIProvider: "invalid-provider" }),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("Invalid settings data");
        });

        it("rejects invalid activeMarketSource values", async () => {
            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ activeMarketSource: "invalid-source" }),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("Invalid settings data");
        });

        it("accepts valid settings", async () => {
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    activeMarketSource: "csfloat",
                    activeAIProvider: "openrouter",
                })
            );

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    activeMarketSource: "csfloat",
                    activeAIProvider: "openrouter",
                }),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.activeMarketSource).toBe("csfloat");
            expect(data.activeAIProvider).toBe("openrouter");
        });

        it("accepts csgotrader as valid market source with sub-provider", async () => {
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    activeMarketSource: "csgotrader",
                    csgotraderSubProvider: "buff163",
                })
            );
            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    activeMarketSource: "csgotrader",
                    csgotraderSubProvider: "buff163",
                }),
            });
            const response = await PATCH(request);
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.activeMarketSource).toBe("csgotrader");
        });

        it("rejects invalid csgotraderSubProvider values", async () => {
            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ csgotraderSubProvider: "invalid-sub-provider" }),
            });
            const response = await PATCH(request);
            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error).toBe("Invalid settings data");
        });
    });

    describe("Masked API Key Protection", () => {
        it("does not overwrite key when masked value is sent back", async () => {
            vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-123"), error: null });

            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-1234567890abcdef1234567890abcdef",
                })
            );
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-1234567890abcdef1234567890abcdef",
                })
            );

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ openAiApiKey: "sk-1...cdef" }),
            });

            const response = await PATCH(request);
            expect(response.status).toBe(200);

            const upsertCall = vi.mocked(prisma.appSettings.upsert).mock.calls[0][0];
            expect(upsertCall.update).not.toHaveProperty("openAiApiKey");
        });

        it("does not overwrite routed provider key when masked value is sent back", async () => {
            vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-123"), error: null });

            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    openRouterApiKey: "sk-or-v1-1234567890abcdef",
                })
            );
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    openRouterApiKey: "sk-or-v1-1234567890abcdef",
                })
            );

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ openRouterApiKey: "sk-o...cdef" }),
            });

            const response = await PATCH(request);
            expect(response.status).toBe(200);

            const upsertCall = vi.mocked(prisma.appSettings.upsert).mock.calls[0][0];
            expect(upsertCall.update).not.toHaveProperty("openRouterApiKey");
        });

        it("saves new key value when different from masked", async () => {
            vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-123"), error: null });

            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-oldkey1234567890abcdef1234",
                })
            );
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-newkey9876543210fedcba9876",
                })
            );

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ openAiApiKey: "sk-newkey9876543210fedcba9876" }),
            });

            const response = await PATCH(request);
            expect(response.status).toBe(200);

            const upsertCall = vi.mocked(prisma.appSettings.upsert).mock.calls[0][0];
            expect(upsertCall.update).toHaveProperty("openAiApiKey", "sk-newkey9876543210fedcba9876");
        });

        it("clears key when empty string is sent", async () => {
            vi.mocked(requireAuth).mockResolvedValue({ session: createMockSession("user-123"), error: null });

            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    geminiApiKey: "AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz",
                })
            );
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    geminiApiKey: null,
                })
            );

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ geminiApiKey: "" }),
            });

            const response = await PATCH(request);
            expect(response.status).toBe(200);

            const upsertCall = vi.mocked(prisma.appSettings.upsert).mock.calls[0][0];
            expect(upsertCall.update).toHaveProperty("geminiApiKey", null);
        });
    });
});
