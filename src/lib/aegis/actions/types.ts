import { z } from "zod";
import type { AegisToolName } from "../types";

export const PortfolioReadActionInputSchema = z.object({
    scope: z.literal("active").default("active"),
});

export const UpdateAcquiredPriceActionInputSchema = z.object({
    inventoryItemId: z.string().min(1),
    acquiredPrice: z.number().nonnegative(),
});

export const WatchlistAddActionInputSchema = z.object({
    itemId: z.string().min(1).optional(),
    marketHashName: z.string().min(1).optional(),
}).refine((value) => Boolean(value.itemId || value.marketHashName), {
    message: "itemId or marketHashName is required",
});

export interface AegisActionProposal {
    runId: string;
    userId: string;
    tool: AegisToolName;
    input: unknown;
    idempotencyKey?: string;
}
