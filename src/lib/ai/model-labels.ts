/**
 * Shared AI model labels — single source of truth for Settings and Chat components.
 * 
 * These labels ensure consistency between the Settings provider dropdown 
 * and the Chat model selector.
 */

import type { AIProviderName } from "@/types";

export interface ModelOption {
    value: AIProviderName;
    label: string;
    shortLabel: string;
}

/**
 * Canonical model definitions used throughout the application.
 * 
 * - value: Internal provider ID stored in database
 * - label: Full label shown in Settings (includes vendor prefix)
 * - shortLabel: Compact label shown in Chat dropdown
 */
export const AI_MODELS: ModelOption[] = [
    {
        value: "gemini-flash",
        label: "Google Gemini 3.1 Flash",
        shortLabel: "Gemini 3.1 Flash",
    },
    {
        value: "openai",
        label: "OpenAI GPT-3.5 Turbo",
        shortLabel: "GPT-3.5 Turbo",
    },
];

/**
 * Get model option by provider name.
 */
export function getModelByValue(value: AIProviderName): ModelOption | undefined {
    return AI_MODELS.find((m) => m.value === value);
}

/**
 * Get display label for a provider (full label for Settings).
 */
export function getModelLabel(value: AIProviderName): string {
    return getModelByValue(value)?.label ?? value;
}

/**
 * Get short label for a provider (compact label for Chat).
 */
export function getModelShortLabel(value: AIProviderName): string {
    return getModelByValue(value)?.shortLabel ?? value;
}
