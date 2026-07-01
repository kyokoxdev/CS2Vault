import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        rateLimitState: {
            upsert: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

import { ApiRequestQueue } from "@/lib/api-queue";

describe("ApiRequestQueue deadlines", () => {
    it("rejects queued work when local rate-limit wait would exceed the deadline", async () => {
        const queue = new ApiRequestQueue({ minDelayMs: 1_000, maxRetries: 0 });

        await queue.enqueue(async () => "first");

        await expect(queue.enqueue(async () => "second", 0, {
            deadlineAtMs: Date.now() + 100,
            minRemainingMs: 50,
        })).rejects.toThrow("Request deadline exceeded");
    });

    it("does not sleep for rate-limit retries that cannot fit before the deadline", async () => {
        const queue = new ApiRequestQueue({ minDelayMs: 100, maxRetries: 1 });

        await expect(queue.enqueue(async () => {
            throw new Error("429 too many requests");
        }, 0, {
            deadlineAtMs: Date.now() + 10,
            maxRetries: 1,
        })).rejects.toThrow("Request deadline exceeded before retry");
    });
});
