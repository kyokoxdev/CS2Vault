import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        marketCapSnapshot: {
            create: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock("child_process", () => ({
    execFile: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { execFile } from "child_process";

const mockExecFile = vi.mocked(execFile);

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

function simulateCurlSuccess(jsonData: unknown) {
    mockExecFile.mockImplementationOnce((_cmd, _args, _opts, callback) => {
        (callback as ExecFileCallback)(null, JSON.stringify(jsonData), "");
        return {} as ReturnType<typeof execFile>;
    });
}

function simulateCurlFailure(message: string) {
    mockExecFile.mockImplementationOnce((_cmd, _args, _opts, callback) => {
        (callback as ExecFileCallback)(new Error(message), "", "");
        return {} as ReturnType<typeof execFile>;
    });
}

async function importModule() {
    return await import("@/lib/market/pricempire-trending");
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExecFile.mockReset();
    vi.mocked(prisma.marketCapSnapshot.create).mockResolvedValue({} as never);
    vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchMarketCapData", () => {
    it("returns chart-based market cap using the latest entry", async () => {
        simulateCurlSuccess([
            { date: "2024-01-01", value: 1200 },
            { date: "2024-01-02", value: 4567 },
        ]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).not.toBeNull();
        expect(result?.provider).toBe("csfloat");
        expect(result?.source).toBe("chart");
        expect(result?.totalMarketCap).toBe(45.67);
        expect(result?.timestamp).toBeInstanceOf(Date);
    });

    it("stores snapshot with normalized fields", async () => {
        simulateCurlSuccess([{ date: "2024-01-01", value: 2500 }]);
        const { fetchMarketCapData } = await importModule();

        await fetchMarketCapData();

        expect(prisma.marketCapSnapshot.create).toHaveBeenCalledWith({
            data: {
                totalMarketCap: 25,
                totalListings: 0,
                provider: "csfloat",
                topItems: null,
                timestamp: expect.any(Date),
            },
        });
    });

    it("returns null when curl fails", async () => {
        simulateCurlFailure("curl: (22) The requested URL returned error: 500");
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
        expect(prisma.marketCapSnapshot.create).not.toHaveBeenCalled();
    });

    it("returns null when chart response is empty", async () => {
        simulateCurlSuccess([]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
    });

    it("returns null when chart returns a non-array response", async () => {
        simulateCurlSuccess({ data: "nope" });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
    });

    it("returns null when chart latest value is non-positive", async () => {
        simulateCurlSuccess([{ date: "2024-01-01", value: -5 }]);
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
    });

    it("returns null when curl returns invalid JSON", async () => {
        mockExecFile.mockImplementationOnce((_cmd, _args, _opts, callback) => {
            (callback as ExecFileCallback)(null, "not json at all", "");
            return {} as ReturnType<typeof execFile>;
        });
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
    });

    it("returns null when both chart and fallback fail", async () => {
        simulateCurlFailure("curl: (7) Failed to connect");
        const { fetchMarketCapData } = await importModule();

        const result = await fetchMarketCapData();

        expect(result).toBeNull();
        expect(prisma.marketCapSnapshot.create).not.toHaveBeenCalled();
    });

    it("serves cached data within TTL without refetching", async () => {
        simulateCurlSuccess([{ date: "2024-01-01", value: 7777 }]);
        const { fetchMarketCapData } = await importModule();

        const first = await fetchMarketCapData();
        const second = await fetchMarketCapData();

        expect(first).toEqual(second);
        expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it("returns stale cache when refetch fails after TTL", async () => {
        const nowSpy = vi.spyOn(Date, "now");
        nowSpy.mockReturnValueOnce(1_000_000);
        simulateCurlSuccess([{ date: "2024-01-01", value: 9999 }]);
        const { fetchMarketCapData } = await importModule();

        const first = await fetchMarketCapData();

        nowSpy.mockReturnValueOnce(1_000_000 + 15 * 60 * 1000 + 1);
        simulateCurlFailure("curl: (28) Operation timed out");

        const second = await fetchMarketCapData();

        expect(second).toEqual(first);
        expect(mockExecFile).toHaveBeenCalledTimes(2);
        nowSpy.mockRestore();
    });

    it("passes correct curl arguments", async () => {
        simulateCurlSuccess([{ date: "2024-01-01", value: 1000 }]);
        const { fetchMarketCapData } = await importModule();

        await fetchMarketCapData();

        expect(mockExecFile).toHaveBeenCalledWith(
            "curl",
            expect.arrayContaining([
                "-s",
                "-f",
                "--max-time", "10",
                "https://pricempire.com/api-data/v1/trending/chart?provider=csfloat",
            ]),
            expect.objectContaining({ timeout: 15_000 }),
            expect.any(Function),
        );
    });
});

describe("cleanupOldSnapshots", () => {
    it("calls deleteMany with default 30-day cutoff", async () => {
        vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 3 } as never);
        const { cleanupOldSnapshots } = await importModule();

        const now = Date.now();
        const result = await cleanupOldSnapshots();

        expect(result).toBe(3);
        const call = vi.mocked(prisma.marketCapSnapshot.deleteMany).mock.calls[0]?.[0];
        const where = call?.where as { timestamp?: { lt?: Date } } | undefined;
        const cutoff = where?.timestamp?.lt as Date;
        const dayMs = 24 * 60 * 60 * 1000;
        const diff = now - cutoff.getTime();
        expect(diff).toBeGreaterThanOrEqual(30 * dayMs - 1000);
        expect(diff).toBeLessThanOrEqual(30 * dayMs + 1000);
    });

    it("uses custom daysToKeep parameter", async () => {
        vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 1 } as never);
        const { cleanupOldSnapshots } = await importModule();

        const now = Date.now();
        const result = await cleanupOldSnapshots(10);

        expect(result).toBe(1);
        const call = vi.mocked(prisma.marketCapSnapshot.deleteMany).mock.calls[0]?.[0];
        const where = call?.where as { timestamp?: { lt?: Date } } | undefined;
        const cutoff = where?.timestamp?.lt as Date;
        const dayMs = 24 * 60 * 60 * 1000;
        const diff = now - cutoff.getTime();
        expect(diff).toBeGreaterThanOrEqual(10 * dayMs - 1000);
        expect(diff).toBeLessThanOrEqual(10 * dayMs + 1000);
    });

    it("returns deleteMany count", async () => {
        vi.mocked(prisma.marketCapSnapshot.deleteMany).mockResolvedValue({ count: 7 } as never);
        const { cleanupOldSnapshots } = await importModule();

        const result = await cleanupOldSnapshots(5);

        expect(result).toBe(7);
    });
});
