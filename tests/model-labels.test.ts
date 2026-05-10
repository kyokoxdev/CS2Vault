/**
 * Unit Tests: AI Model Labels
 * Tests shared model label constants and helper functions
 */

import { describe, it, expect } from "vitest";
import {
    AI_MODELS,
    getModelByValue,
    getModelLabel,
    getModelShortLabel,
} from "@/lib/ai/model-labels";

describe("AI Model Labels", () => {
    describe("AI_MODELS constant", () => {
        it("contains both models", () => {
            expect(AI_MODELS).toHaveLength(2);
        });

        it("contains gemini-flash", () => {
            const model = AI_MODELS.find((m) => m.value === "gemini-flash");
            expect(model).toBeDefined();
            expect(model?.label).toBe("Google Gemini 3.1 Flash");
            expect(model?.shortLabel).toBe("Gemini 3.1 Flash");
        });

        it("contains openai", () => {
            const model = AI_MODELS.find((m) => m.value === "openai");
            expect(model).toBeDefined();
            expect(model?.label).toBe("OpenAI GPT-3.5 Turbo");
            expect(model?.shortLabel).toBe("GPT-3.5 Turbo");
        });
    });

    describe("getModelByValue", () => {
        it("returns model for valid value", () => {
            const model = getModelByValue("gemini-flash");
            expect(model).toBeDefined();
            expect(model?.value).toBe("gemini-flash");
        });

        it("returns undefined for invalid value", () => {
            // @ts-expect-error - testing invalid input
            const model = getModelByValue("invalid-model");
            expect(model).toBeUndefined();
        });
    });

    describe("getModelLabel", () => {
        it("returns full label for gemini-flash", () => {
            expect(getModelLabel("gemini-flash")).toBe("Google Gemini 3.1 Flash");
        });

        it("returns full label for openai", () => {
            expect(getModelLabel("openai")).toBe("OpenAI GPT-3.5 Turbo");
        });

        it("returns value as fallback for unknown model", () => {
            // @ts-expect-error - testing invalid input
            expect(getModelLabel("unknown")).toBe("unknown");
        });
    });

    describe("getModelShortLabel", () => {
        it("returns short label for gemini-flash", () => {
            expect(getModelShortLabel("gemini-flash")).toBe("Gemini 3.1 Flash");
        });

        it("returns short label for openai", () => {
            expect(getModelShortLabel("openai")).toBe("GPT-3.5 Turbo");
        });

        it("returns value as fallback for unknown model", () => {
            // @ts-expect-error - testing invalid input
            expect(getModelShortLabel("unknown")).toBe("unknown");
        });
    });
});