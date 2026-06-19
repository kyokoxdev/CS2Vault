import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import type { MarketContext } from "@/types";

const context: MarketContext = {
    topGainers: [],
    topLosers: [],
    marketOverview: {
        totalMarketCap: 1250000,
        trackedItemCount: 42,
        watchlistCount: 3,
        priceSource: "steam",
        lastSyncAge: "5 minutes ago",
    },
    researchPacket: {
        generatedAt: "2026-06-18T00:00:00.000Z",
        retrievalMode: "targeted",
        coverage: ["AK-47 Redline tracked"],
        currentPricingSignals: ["Current price $30"],
        historicalSignals: ["30-day close range $28-$34"],
        dataLimits: [],
    },
    userQuery: "Should I buy AK-47 Redline?",
};

describe("buildSystemPrompt agent stages", () => {
    it("keeps the Researcher stage evidence-only", () => {
        const prompt = buildSystemPrompt(context, {
            agentMode: "researcher",
            agentStage: "researcher",
            reasoningDepth: "high",
        });

        expect(prompt).toContain("You are operating as the Researcher subagent for this turn.");
        expect(prompt).toContain("Active harness stage: Researcher subagent.");
        expect(prompt).toContain("Do not give final buy/sell/hold advice");
        expect(prompt).not.toContain("You are operating as the Consultant final-answer agent for this turn.");
        expect(prompt).not.toContain("finish the user's request with a clear recommendation");
    });

    it("includes delegated Researcher findings for the Consultant final stage", () => {
        const prompt = buildSystemPrompt(context, {
            agentMode: "consultant",
            agentStage: "consultant-final",
            delegatedResearch: "Liquidity is thin, but momentum is improving.",
            reasoningDepth: "high",
        });

        expect(prompt).toContain("You are operating as the Consultant final-answer agent for this turn.");
        expect(prompt).toContain("Active harness stage: Consultant final answer.");
        expect(prompt).toContain("=== DELEGATED RESEARCHER FINDINGS ===");
        expect(prompt).toContain("Liquidity is thin, but momentum is improving.");
        expect(prompt).toContain("=== END DELEGATED FINDINGS ===");
    });
});
