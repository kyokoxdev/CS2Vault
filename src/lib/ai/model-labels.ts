/**
 * Shared AI model labels — single source of truth for Settings and Chat components.
 * 
 * These labels ensure consistency between the Settings provider dropdown 
 * and the Chat model selector.
 */

import type { AIAgentMode, AIProviderName, AIReasoningDepth } from "@/types";

export type AIModelIconKey = "gemini" | "openai" | "anthropic" | "openrouter" | "9router";

export interface ModelOption {
    value: AIProviderName;
    label: string;
    shortLabel: string;
    iconKey: AIModelIconKey;
    reasoningDepthOptions: readonly AIReasoningDepth[];
    defaultReasoningDepth?: AIReasoningDepth;
}

export interface ReasoningDepthOption {
    value: AIReasoningDepth;
    label: string;
    shortLabel: string;
    description: string;
}

export interface AgentModeOption {
    value: AIAgentMode;
    label: string;
    description: string;
}

export interface OpenRouterModelOption {
    value: string;
    label: string;
    description: string;
}

export const AI_PROVIDER_VALUES = ["gemini-flash", "openai", "anthropic", "openrouter", "9router"] as const;
export const AI_REASONING_DEPTH_VALUES = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export const AI_AGENT_MODE_VALUES = ["consultant", "researcher"] as const;
export const DEFAULT_OPENROUTER_MODEL_ID = "openai/gpt-latest";

export const OPENROUTER_MODEL_OPTIONS: OpenRouterModelOption[] = [
    {
        value: DEFAULT_OPENROUTER_MODEL_ID,
        label: "Auto GPT Latest",
        description: "OpenRouter's auto-routed GPT latest model.",
    },
    {
        value: "openai/gpt-oss-120b",
        label: "GPT-OSS-120b",
        description: "OpenAI GPT-OSS 120B through OpenRouter.",
    },
    {
        value: "openai/gpt-oss-120b:free",
        label: "GPT-OSS-120b Free",
        description: "Free OpenRouter variant when available.",
    },
];

const GEMINI_REASONING_DEPTHS = ["minimal", "low", "medium", "high"] as const satisfies readonly AIReasoningDepth[];
const CLAUDE_REASONING_DEPTHS = ["low", "medium", "high", "xhigh", "max"] as const satisfies readonly AIReasoningDepth[];

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
        label: "Google Gemini 3 Flash Preview",
        shortLabel: "Gemini 3 Flash (Preview)",
        iconKey: "gemini",
        reasoningDepthOptions: GEMINI_REASONING_DEPTHS,
        defaultReasoningDepth: "high",
    },
    {
        value: "openai",
        label: "OpenAI GPT-4o Mini",
        shortLabel: "GPT-4o Mini",
        iconKey: "openai",
        reasoningDepthOptions: [],
    },
    {
        value: "anthropic",
        label: "Anthropic Claude Opus 4.7",
        shortLabel: "Claude Opus 4.7",
        iconKey: "anthropic",
        reasoningDepthOptions: CLAUDE_REASONING_DEPTHS,
        defaultReasoningDepth: "high",
    },
    {
        value: "openrouter",
        label: "OpenRouter",
        shortLabel: "OpenRouter",
        iconKey: "openrouter",
        reasoningDepthOptions: [],
    },
    {
        value: "9router",
        label: "9Router Local Gateway",
        shortLabel: "9Router Local",
        iconKey: "9router",
        reasoningDepthOptions: [],
    },
];

export const AI_REASONING_DEPTH_OPTIONS: ReasoningDepthOption[] = [
    {
        value: "none",
        label: "None",
        shortLabel: "None",
        description: "No extra reasoning effort when the selected model supports disabling it.",
    },
    {
        value: "minimal",
        label: "Minimal",
        shortLabel: "Minimal",
        description: "Smallest supported reasoning pass for fast responses.",
    },
    {
        value: "low",
        label: "Low",
        shortLabel: "Low",
        description: "Light reasoning for direct answers with limited scenario work.",
    },
    {
        value: "medium",
        label: "Medium",
        shortLabel: "Medium",
        description: "Balanced reasoning for evidence, calculations, and concise market context.",
    },
    {
        value: "high",
        label: "High",
        shortLabel: "High",
        description: "Deeper reasoning for scenarios, risk checks, and market uncertainty.",
    },
    {
        value: "xhigh",
        label: "Extra High",
        shortLabel: "X-High",
        description: "Claude's extended high-effort mode for complex analysis.",
    },
    {
        value: "max",
        label: "Max",
        shortLabel: "Max",
        description: "Claude's maximum supported reasoning effort.",
    },
];

export const AI_AGENT_MODE_OPTIONS: AgentModeOption[] = [
    {
        value: "consultant",
        label: "Consultant",
        description: "Turns market evidence into strategy, forecasts, and decisions.",
    },
    {
        value: "researcher",
        label: "Researcher",
        description: "Surfaces current and historical data, gaps, and analytical inputs.",
    },
];

/**
 * Get model option by provider name.
 */
export function getModelByValue(value: string): ModelOption | undefined {
    return AI_MODELS.find((m) => m.value === value);
}

export function isAIProviderName(value: string): value is AIProviderName {
    return AI_PROVIDER_VALUES.some((provider) => provider === value);
}

export function isAIReasoningDepth(value: string): value is AIReasoningDepth {
    return AI_REASONING_DEPTH_VALUES.some((depth) => depth === value);
}

export function isAIAgentMode(value: string): value is AIAgentMode {
    return AI_AGENT_MODE_VALUES.some((mode) => mode === value);
}

/**
 * Get display label for a provider (full label for Settings).
 */
export function getModelLabel(value: string): string {
    return getModelByValue(value)?.label ?? value;
}

/**
 * Get short label for a provider (compact label for Chat).
 */
export function getModelShortLabel(value: string): string {
    return getModelByValue(value)?.shortLabel ?? value;
}

export function getOpenRouterModelLabel(value: string): string {
    return OPENROUTER_MODEL_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function getReasoningDepthOption(value: AIReasoningDepth): ReasoningDepthOption | undefined {
    return AI_REASONING_DEPTH_OPTIONS.find((option) => option.value === value);
}

export function getReasoningDepthOptionsForModel(value: AIProviderName): ReasoningDepthOption[] {
    const model = getModelByValue(value);
    if (!model) return [];

    return AI_REASONING_DEPTH_OPTIONS.filter((option) => model.reasoningDepthOptions.includes(option.value));
}

export function supportsReasoningDepth(value: AIProviderName): boolean {
    return getReasoningDepthOptionsForModel(value).length > 0;
}

export function getDefaultReasoningDepthForModel(value: AIProviderName): AIReasoningDepth | undefined {
    const model = getModelByValue(value);
    return model?.defaultReasoningDepth;
}

export function isReasoningDepthSupportedForModel(value: AIProviderName, depth: AIReasoningDepth): boolean {
    return getReasoningDepthOptionsForModel(value).some((option) => option.value === depth);
}
