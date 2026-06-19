/**
 * Unit Tests: AI Model Labels
 * Tests shared model label constants and helper functions
 */

import { describe, it, expect } from "vitest";
import {
    AI_AGENT_MODE_OPTIONS,
    AI_MODELS,
    DEFAULT_OPENROUTER_MODEL_ID,
    OPENROUTER_MODEL_OPTIONS,
    AI_REASONING_DEPTH_OPTIONS,
    getDefaultReasoningDepthForModel,
    getModelByValue,
    getModelLabel,
    getModelShortLabel,
    getOpenRouterModelLabel,
    getReasoningDepthOptionsForModel,
    isAIAgentMode,
    isAIProviderName,
    isAIReasoningDepth,
    supportsReasoningDepth,
} from "@/lib/ai/model-labels";

describe("AI Model Labels", () => {
    describe("AI_MODELS constant", () => {
        it("contains all supported AI engines", () => {
            expect(AI_MODELS.map((model) => model.value)).toEqual([
                "gemini-flash",
                "openai",
                "anthropic",
                "openrouter",
                "9router",
            ]);
        });

        it("contains gemini-flash", () => {
            const model = AI_MODELS.find((m) => m.value === "gemini-flash");
            expect(model).toBeDefined();
            expect(model?.label).toBe("Google Gemini 3 Flash Preview");
            expect(model?.shortLabel).toBe("Gemini 3 Flash (Preview)");
            expect(model?.iconKey).toBe("gemini");
        });

        it("contains openai", () => {
            const model = AI_MODELS.find((m) => m.value === "openai");
            expect(model).toBeDefined();
            expect(model?.label).toBe("OpenAI GPT-4o Mini");
            expect(model?.shortLabel).toBe("GPT-4o Mini");
            expect(model?.reasoningDepthOptions).toEqual([]);
        });

        it("contains direct and routed Claude/OpenAI-compatible providers", () => {
            expect(AI_MODELS.find((m) => m.value === "anthropic")?.shortLabel).toBe("Claude Opus 4.7");
            expect(AI_MODELS.find((m) => m.value === "openrouter")?.shortLabel).toBe("OpenRouter");
            expect(AI_MODELS.find((m) => m.value === "9router")?.shortLabel).toBe("9Router Local");
        });
    });

    describe("getModelByValue", () => {
        it("returns model for valid value", () => {
            const model = getModelByValue("gemini-flash");
            expect(model).toBeDefined();
            expect(model?.value).toBe("gemini-flash");
        });

        it("returns undefined for invalid value", () => {
            expect(getModelByValue("invalid-model")).toBeUndefined();
        });
    });

    describe("getModelLabel", () => {
        it("returns full label for gemini-flash", () => {
            expect(getModelLabel("gemini-flash")).toBe("Google Gemini 3 Flash Preview");
        });

        it("returns full label for openai", () => {
            expect(getModelLabel("openai")).toBe("OpenAI GPT-4o Mini");
        });

        it("returns full label for anthropic", () => {
            expect(getModelLabel("anthropic")).toBe("Anthropic Claude Opus 4.7");
        });

        it("returns value as fallback for unknown model", () => {
            expect(getModelLabel("unknown")).toBe("unknown");
        });
    });

    describe("getModelShortLabel", () => {
        it("returns short label for gemini-flash", () => {
            expect(getModelShortLabel("gemini-flash")).toBe("Gemini 3 Flash (Preview)");
        });

        it("returns short label for openai", () => {
            expect(getModelShortLabel("openai")).toBe("GPT-4o Mini");
        });

        it("returns short label for routed providers", () => {
            expect(getModelShortLabel("openrouter")).toBe("OpenRouter");
            expect(getModelShortLabel("9router")).toBe("9Router Local");
        });

        it("returns value as fallback for unknown model", () => {
            expect(getModelShortLabel("unknown")).toBe("unknown");
        });
    });

    describe("option guards", () => {
        it("recognizes supported provider names", () => {
            expect(isAIProviderName("anthropic")).toBe(true);
            expect(isAIProviderName("invalid-model")).toBe(false);
        });

        it("recognizes reasoning depth options", () => {
            expect(AI_REASONING_DEPTH_OPTIONS.map((option) => option.value)).toEqual(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
            expect(isAIReasoningDepth("high")).toBe(true);
            expect(isAIReasoningDepth("balanced")).toBe(false);
        });

        it("recognizes agent modes", () => {
            expect(AI_AGENT_MODE_OPTIONS.map((option) => option.value)).toEqual(["consultant", "researcher"]);
            expect(isAIAgentMode("consultant")).toBe(true);
            expect(isAIAgentMode("trader")).toBe(false);
        });
    });

    describe("model reasoning capabilities", () => {
        it("returns Gemini 3 Flash thinking levels and default", () => {
            expect(getReasoningDepthOptionsForModel("gemini-flash").map((option) => option.value)).toEqual(["minimal", "low", "medium", "high"]);
            expect(getDefaultReasoningDepthForModel("gemini-flash")).toBe("high");
            expect(supportsReasoningDepth("gemini-flash")).toBe(true);
        });

        it("returns Claude Opus effort levels and default", () => {
            expect(getReasoningDepthOptionsForModel("anthropic").map((option) => option.value)).toEqual(["low", "medium", "high", "xhigh", "max"]);
            expect(getDefaultReasoningDepthForModel("anthropic")).toBe("high");
            expect(supportsReasoningDepth("anthropic")).toBe(true);
        });

        it("hides reasoning controls for models without known supported depth", () => {
            expect(getReasoningDepthOptionsForModel("openai")).toEqual([]);
            expect(getReasoningDepthOptionsForModel("openrouter")).toEqual([]);
            expect(getReasoningDepthOptionsForModel("9router")).toEqual([]);
            expect(getDefaultReasoningDepthForModel("openai")).toBeUndefined();
            expect(supportsReasoningDepth("openai")).toBe(false);
        });
    });

    describe("OpenRouter model options", () => {
        it("includes the default auto model and GPT-OSS-120b presets", () => {
            expect(DEFAULT_OPENROUTER_MODEL_ID).toBe("openai/gpt-latest");
            expect(OPENROUTER_MODEL_OPTIONS.map((option) => option.value)).toContain("openai/gpt-oss-120b");
            expect(getOpenRouterModelLabel("openai/gpt-oss-120b")).toBe("GPT-OSS-120b");
        });

        it("falls back to the raw OpenRouter model id for custom models", () => {
            expect(getOpenRouterModelLabel("anthropic/claude-sonnet-4.5")).toBe("anthropic/claude-sonnet-4.5");
        });
    });
});
