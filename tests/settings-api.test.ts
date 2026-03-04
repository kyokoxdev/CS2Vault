/**
 * Unit Tests: Settings API
 * Tests auth guard, API key masking, and Zod validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Mock auth
vi.mock("@/lib/auth/auth", () => ({
    auth: vi.fn(),
}));

// Mock revalidatePath
vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth/auth";
import { GET, PATCH } from "@/app/api/settings/route";

// Helper to create mock settings with all required fields
const createMockSettings = (overrides: Partial<{
    id: string;
    activeMarketSource: string;
    activeAIProvider: string;
    syncIntervalMin: number;
    openAiApiKey: string | null;
    geminiApiKey: string | null;
    csfloatApiKey: string | null;
    csgotraderSubProvider: string | null;
}>) => ({
    id: "singleton",
    activeMarketSource: "csfloat",
    activeAIProvider: "gemini-pro",
    syncIntervalMin: 5,
    openAiApiKey: null,
    geminiApiKey: null,
    csfloatApiKey: null,
    csgotraderSubProvider: "csfloat",
    watchlistOnly: false,
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiry: null,
    ...overrides,
});

// Helper to create mock session
const createMockSession = (userId: string) => ({
    user: { id: userId },
    expires: new Date(Date.now() + 86400000).toISOString(),
});

describe("Settings API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: no session (unauthenticated)
        vi.mocked(auth).mockResolvedValue(null as unknown as ReturnType<typeof auth>);
    });

    describe("Auth Guard", () => {
        it("GET returns 401 when not authenticated in production", async () => {
            // Force production mode check by ensuring no dev fallback
            vi.mocked(auth).mockResolvedValue(null as unknown as ReturnType<typeof auth>);
            vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

            // In test env, the dev fallback may kick in, but we can test the auth flow
            const response = await GET();
            // If no user found even in dev fallback, should get 401
            expect(response.status).toBe(401);
        });

        it("PATCH returns 401 when not authenticated", async () => {
            vi.mocked(auth).mockResolvedValue(null as unknown as ReturnType<typeof auth>);
            vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
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
            vi.mocked(auth).mockResolvedValue(createMockSession("user-123") as unknown as ReturnType<typeof auth>);
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(null);

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.activeAIProvider).toBe("gemini-pro");
        });
    });

    describe("API Key Masking", () => {
        it("masks API keys in GET response", async () => {
            vi.mocked(auth).mockResolvedValue(createMockSession("user-123") as unknown as ReturnType<typeof auth>);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-1234567890abcdef1234567890abcdef",
                    geminiApiKey: "AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz",
                    csfloatApiKey: null,
                }) as any
            );

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            // Keys should be masked
            expect(data.openAiApiKey).toBe("sk-1...cdef");
            expect(data.geminiApiKey).toBe("AIza...WxYz");
            expect(data.csfloatApiKey).toBe("");
        });

        it("masks API keys in PATCH response", async () => {
            vi.mocked(auth).mockResolvedValue(createMockSession("user-123") as unknown as ReturnType<typeof auth>);
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(null);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    activeAIProvider: "openai",
                    openAiApiKey: "sk-newkey1234567890abcdef",
                }) as any
            );

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ activeAIProvider: "openai" }),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.openAiApiKey).toBe("sk-n...cdef");
        });
    });

    describe("Zod Validation", () => {
        beforeEach(() => {
            vi.mocked(auth).mockResolvedValue(createMockSession("user-123") as unknown as ReturnType<typeof auth>);
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

        it("rejects syncIntervalMin out of range", async () => {
            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ syncIntervalMin: 0 }),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("Invalid settings data");
        });

        it("rejects syncIntervalMin above max", async () => {
            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ syncIntervalMin: 1441 }),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBe("Invalid settings data");
        });

        it("accepts valid settings", async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    activeMarketSource: "csfloat",
                    activeAIProvider: "gemini-flash",
                    syncIntervalMin: 15,
                }) as any
            );

            const request = new Request("http://localhost/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    activeMarketSource: "csfloat",
                    activeAIProvider: "gemini-flash",
                    syncIntervalMin: 15,
                }),
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.activeMarketSource).toBe("csfloat");
            expect(data.activeAIProvider).toBe("gemini-flash");
            expect(data.syncIntervalMin).toBe(15);
        });

        it("accepts csgotrader as valid market source with sub-provider", async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    activeMarketSource: "csgotrader",
                    csgotraderSubProvider: "buff163",
                }) as any
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
            vi.mocked(auth).mockResolvedValue(createMockSession("user-123") as unknown as ReturnType<typeof auth>);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-1234567890abcdef1234567890abcdef",
                }) as any
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-1234567890abcdef1234567890abcdef",
                }) as any
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

        it("saves new key value when different from masked", async () => {
            vi.mocked(auth).mockResolvedValue(createMockSession("user-123") as unknown as ReturnType<typeof auth>);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-oldkey1234567890abcdef1234",
                }) as any
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    openAiApiKey: "sk-newkey9876543210fedcba9876",
                }) as any
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
            vi.mocked(auth).mockResolvedValue(createMockSession("user-123") as unknown as ReturnType<typeof auth>);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.findUnique).mockResolvedValue(
                createMockSettings({
                    geminiApiKey: "AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz",
                }) as any
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.mocked(prisma.appSettings.upsert).mockResolvedValue(
                createMockSettings({
                    geminiApiKey: null,
                }) as any
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
