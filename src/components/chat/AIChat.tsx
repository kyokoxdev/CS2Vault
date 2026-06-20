"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FaArrowRight, FaBars, FaBriefcase, FaChevronDown, FaComments, FaPaperclip, FaPlus, FaSearch, FaStop, FaTimes, FaGlobe } from "react-icons/fa";
import { SiAnthropic, SiGooglegemini, SiOpenai } from "react-icons/si";
import styles from "./AIChat.module.css";
import type { AIAgentMode, AIProviderName, AIReasoningDepth, ChatMessageData } from "@/types";
import {
    AI_AGENT_MODE_OPTIONS,
    AI_MODELS,
    DEFAULT_OPENROUTER_MODEL_ID,
    OPENROUTER_MODEL_OPTIONS,
    getDefaultReasoningDepthForModel,
    getModelByValue,
    getOpenRouterModelLabel,
    getReasoningDepthOptionsForModel,
    isAIAgentMode,
    isAIProviderName,
    isAIReasoningDepth,
} from "@/lib/ai/model-labels";
import { AEGIS_ITEM_SELECTED_EVENT, type AegisSelectedItem, formatItemMention } from "@/lib/ai/item-mentions";
import {
    SLASH_COMMANDS,
    type SlashCommandName,
    parseSlashCommand,
    isShowingCommandPalette,
    getCommandPrefix,
    getItemSearchQuery,
    buildAnalyzePrompt,
    buildComparePrompt,
    buildPortfolioPrompt,
} from "@/lib/ai/slash-commands";
import { AegisActionCard } from "./AegisActionCard";
import { AegisNotebook } from "./AegisNotebook";
import { parseAegisStreamChunk, type AegisClientStreamEvent } from "./aegisStream";
import type { AegisActionStatus, AegisApprovalStatus, AegisRunStatus, AegisTraceEventType } from "@/lib/aegis/types";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_OPENROUTER_MODEL_ID_LENGTH = 160;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_CONTEXT_MESSAGES = 30;
// Must exceed the maximum expected gap between streamed chunks in consultant mode.
// In consultant mode the harness performs a full researcher AI call (server-side)
// between the initial researcher-status chunk and the first consultant chunk.
// The Gemini queue enforces a 2 s minimum delay, and actual API call time adds
// several more seconds, so 1.5 s was far too short and caused premature
// idle-completion that cut off the entire consultant response.
const STREAM_IDLE_COMPLETION_TIMEOUT_MS = process.env.NODE_ENV === "test" ? 1_000 : 30_000;
const AEGIS_RUN_POLL_INTERVAL_MS = process.env.NODE_ENV === "test" ? 20 : 1_000;
const AEGIS_RUN_MAX_POLL_ATTEMPTS = process.env.NODE_ENV === "test" ? 20 : 120;

const ITEM_AUTOCOMPLETE_DEBOUNCE_MS = 280;

const AEGIS_TIPS = [
    {
        label: "Press Cmd/Ctrl+K to search CS2 items.",
        prompt: "Use Cmd/Ctrl+K to open item search, then tell me which item you want analyzed and I’ll break down its market setup.",
    },
    {
        label: "Press Enter to send, Shift+Enter for a new line.",
        prompt: "Compare two scenarios for my next trade. Keep the answer concise, and assume I’ll use Enter to send follow-ups and Shift+Enter for multi-line notes.",
    },
    {
        label: "Paste an image with Ctrl+V or use the attach button.",
        prompt: "I’m attaching a screenshot. Read the chart context, call out the trend, and tell me what stands out.",
    },
    {
        label: "Ask for 90-day price history and OHLCV context.",
        prompt: "Analyze this item using its 90-day price history and OHLCV context. Highlight trend quality, volume confirmation, and likely near-term scenarios.",
    },
    {
        label: "Ask Aegis to check support, resistance, volatility, and volume.",
        prompt: "Check support and resistance, recent volatility, and whether volume trends confirm the current move for this item.",
    },
    {
        label: "Ask for portfolio P&L, position sizing, and risk/reward.",
        prompt: "Review my portfolio P&L and suggest the best risk/reward adjustments I should make right now.",
    },
    {
        label: "Compare top movers, watchlist items, and news catalysts.",
        prompt: "Scan top movers, my watchlist, and recent CS2 news catalysts. Which items deserve immediate attention and why?",
    },
] as const;

const WELCOME_MESSAGE: ChatMessageData = {
    role: "assistant",
    content: "Hi, how can I help you today?",
};

type ChatMessage = ChatMessageData & {
    id: string;
    provider?: AIProviderName;
    agentMode?: AIAgentMode;
    reasoningDepth?: AIReasoningDepth;
    openRouterModelId?: string;
    reasoningDurationMs?: number;
    aegisEvents?: AegisClientStreamEvent[];
};

const RENDERABLE_AEGIS_EVENT_TYPES = new Set<AegisClientStreamEvent["type"]>([
    "aegis.action_preview",
    "aegis.approval_required",
    "aegis.action_succeeded",
    "aegis.refetch",
    "aegis.error",
]);

const AEGIS_TRACE_EVENT_TYPE_SET = new Set<string>([
    "aegis.stage",
    "aegis.delta",
    "aegis.action_preview",
    "aegis.approval_required",
    "aegis.action_succeeded",
    "aegis.refetch",
    "aegis.error",
    "aegis.done",
]);

interface AegisTextSelectOption<T extends string> {
    value: T;
    label: string;
    icon?: ReactNode;
    className?: string;
}

interface AegisTextSelectProps<T extends string> {
    ariaLabel: string;
    value: T;
    options: AegisTextSelectOption<T>[];
    disabled?: boolean;
    className?: string;
    showChevron?: boolean;
    onChange: (value: T) => void;
}

function AegisTextSelect<T extends string>({
    ariaLabel,
    value,
    options,
    disabled,
    className,
    showChevron = false,
    onChange,
}: AegisTextSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const selectedOption = options.find((option) => option.value === value) ?? options[0];

    if (!selectedOption) {
        return null;
    }

    return (
        <div
            className={`${styles.aegisTextSelect} ${className ?? ""}`}
            onBlur={(event) => {
                const nextFocusedElement = event.relatedTarget;
                if (!(nextFocusedElement instanceof Node) || !event.currentTarget.contains(nextFocusedElement)) {
                    setOpen(false);
                }
            }}
        >
            <button
                type="button"
                className={`${styles.aegisTextTrigger} ${showChevron ? styles.aegisTextTriggerWithChevron : ""} ${open ? styles.aegisTextTriggerOpen : ""} ${selectedOption.className ?? ""}`}
                aria-label={selectedOption.label}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
            >
                {selectedOption.icon}
                <span>{selectedOption.label}</span>
                {showChevron ? <FaChevronDown className={styles.aegisTextChevron} aria-hidden="true" focusable="false" /> : null}
            </button>
            {open && (
                <div className={styles.aegisTextMenu} role="listbox" aria-label={ariaLabel}>
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={option.value === value}
                            className={`${styles.aegisTextOption} ${option.className ?? ""}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                        >
                            {option.icon}
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function getAgentClassName(agentMode: AIAgentMode): string {
    return agentMode === "researcher" ? styles.agentResearcher : styles.agentConsultant;
}

function getReasoningClassName(): string {
    return styles.reasoningDepthText;
}

function formatReasoningDuration(durationMs: number | undefined): string {
    if (durationMs === undefined) {
        return "thinking";
    }

    if (durationMs < 1000) {
        return `${Math.max(1, Math.round(durationMs))}ms`;
    }

    return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)}s`;
}

function ProviderIcon({ provider }: { provider: AIProviderName }) {
    if (provider === "gemini-flash") {
        return <SiGooglegemini className={styles.providerIcon} aria-hidden="true" focusable="false" />;
    }

    if (provider === "openai") {
        return <SiOpenai className={styles.providerIcon} aria-hidden="true" focusable="false" />;
    }

    if (provider === "anthropic") {
        return <SiAnthropic className={styles.providerIcon} aria-hidden="true" focusable="false" />;
    }

    return null;
}

interface ChatSessionData {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    _count?: { messages: number };
}

interface ChatSessionResponse {
    success: boolean;
    data?: ChatSessionData;
    error?: string;
}

interface ChatDraft {
    content: string;
    imageBase64: string | null;
}

interface ChatMessageMetadata {
    provider?: AIProviderName;
    agentMode?: AIAgentMode;
    reasoningDepth?: AIReasoningDepth;
    openRouterModelId?: string;
    durableRunId?: string;
}

interface PersistedChatMessage {
    id: string;
    role: string;
    content: string;
    metadata: string | null;
    createdAt: string;
}

interface AegisTraceRecord {
    type: string;
    sequence: number;
    stage: string | null;
    message: string | null;
    payload: unknown;
    error: string | null;
}

interface AegisActionRecord {
    id: string;
    tool: string;
    status: AegisActionStatus;
    risk: string;
    input: unknown;
    output: unknown;
    inputPreview: string | null;
    outputPreview: string | null;
    approval?: { status: AegisApprovalStatus } | null;
}

interface AegisRunRecord {
    id: string;
    status: AegisRunStatus;
    finalResponse: string | null;
    error: string | null;
    traces: AegisTraceRecord[];
    actions: AegisActionRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseMessageMetadata(metadata: string | null | undefined): ChatMessageMetadata {
    if (!metadata) return {};

    try {
        const parsed = JSON.parse(metadata);
        if (!isRecord(parsed)) return {};

        const result: ChatMessageMetadata = {};
        if (typeof parsed.provider === "string" && isAIProviderName(parsed.provider)) result.provider = parsed.provider;
        if (typeof parsed.agentMode === "string" && isAIAgentMode(parsed.agentMode)) result.agentMode = parsed.agentMode;
        if (typeof parsed.reasoningDepth === "string" && isAIReasoningDepth(parsed.reasoningDepth)) result.reasoningDepth = parsed.reasoningDepth;
        if (typeof parsed.openRouterModelId === "string") result.openRouterModelId = parsed.openRouterModelId;
        if (typeof parsed.durableRunId === "string") result.durableRunId = parsed.durableRunId;
        return result;
    } catch (error) {
        console.warn("[AIChat] Failed to parse chat message metadata", error);
        return {};
    }
}

function isAegisTraceEventType(value: string): value is AegisTraceEventType {
    return AEGIS_TRACE_EVENT_TYPE_SET.has(value);
}

function mergeActionStatusIntoPayload(payload: unknown, actionsById: Map<string, AegisActionRecord>): unknown {
    if (!isRecord(payload)) return payload;

    const actionId = typeof payload.actionId === "string" ? payload.actionId : undefined;
    if (!actionId) return payload;

    const action = actionsById.get(actionId);
    if (!action) return payload;

    return {
        ...payload,
        actionStatus: action.status,
        approvalStatus: action.approval?.status,
    };
}

function mapRunToAegisEvents(run: AegisRunRecord): AegisClientStreamEvent[] {
    const actionsById = new Map(run.actions.map((action) => [action.id, action]));

    return run.traces
        .filter((trace) => isAegisTraceEventType(trace.type))
        .map((trace) => ({
            type: trace.type as AegisTraceEventType,
            sequence: trace.sequence,
            stage: trace.stage,
            message: trace.message,
            payload: mergeActionStatusIntoPayload(trace.payload, actionsById),
            error: trace.error,
        }));
}

function getRunDisplayContent(run: AegisRunRecord, fallback: string): string {
    if (run.finalResponse?.trim()) {
        return run.finalResponse;
    }

    const deltaText = run.traces
        .filter((trace) => trace.type === "aegis.delta" && typeof trace.message === "string")
        .map((trace) => trace.message)
        .join("");
    if (deltaText.trim()) {
        return deltaText;
    }

    if (run.status === "failed") {
        return run.error || "Aegis run failed.";
    }

    return fallback;
}

function getQueuedRunId(event: AegisClientStreamEvent): string | null {
    if (event.type !== "aegis.stage" || !isRecord(event.payload)) {
        return null;
    }

    return typeof event.payload.runId === "string" ? event.payload.runId : null;
}

function waitForNextRunPoll(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, AEGIS_RUN_POLL_INTERVAL_MS));
}

async function fetchAegisRun(runId: string): Promise<AegisRunRecord | null> {
    const res = await fetch(`/api/aegis/runs/${encodeURIComponent(runId)}`);
    if (!res.ok) return null;

    const data = await res.json() as { success?: boolean; data?: AegisRunRecord };
    return data.success && data.data ? data.data : null;
}

function createChatMessage(message: ChatMessageData): ChatMessage {
    return {
        ...message,
        id: crypto.randomUUID(),
    };
}

function isWelcomeMessage(message: ChatMessageData): boolean {
    return message.role === WELCOME_MESSAGE.role && message.content === WELCOME_MESSAGE.content;
}

function hasRenderableAegisEvents(message: ChatMessage): boolean {
    return Array.isArray(message.aegisEvents)
        && message.aegisEvents.some((event) => RENDERABLE_AEGIS_EVENT_TYPES.has(event.type));
}

function getNextTipIndex(currentIndex: number): number {
    return (currentIndex + 1) % AEGIS_TIPS.length;
}

// ─── Item autocomplete result shape (mirrors /api/search response) ────────────
interface ItemSearchResult {
    id: string | null;
    hashName: string;
    name: string;
    imageUrl: string | null;
    price: string | null;
    listings: number;
    category: string;
    type: string | null;
    rarity: string | null;
    exterior: string | null;
}

// ─── Portfolio item shape (from /api/portfolio) ───────────────────────────────
interface PortfolioItem {
    id: string;
    itemId: string;
    name: string;
    marketHashName: string;
    imageUrl: string | null;
    currentPrice: number | null;
    category: string;
    rarity: string | null;
    exterior: string | null;
}

interface AttachedPortfolioItem {
    id: string;
    name: string;
    imageUrl: string | null;
    marketHashName: string;
    currentPrice: number | null;
}

interface AIChatProps {
    initialSessionId?: string;
}

export default function AIChat({ initialSessionId }: AIChatProps = {}) {
    const router = useRouter();
    const [sessions, setSessions] = useState<ChatSessionData[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [provider, setProvider] = useState<AIProviderName>("gemini-flash");
    const [openRouterModelId, setOpenRouterModelId] = useState(DEFAULT_OPENROUTER_MODEL_ID);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [reasoningDepth, setReasoningDepth] = useState<AIReasoningDepth | undefined>(getDefaultReasoningDepthForModel("gemini-flash"));
    const [agentMode, setAgentMode] = useState<AIAgentMode>("consultant");
    const [historyExpanded, setHistoryExpanded] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const [attachedPortfolioItem, setAttachedPortfolioItem] = useState<AttachedPortfolioItem | null>(null);
    const [deepResearchActive, setDeepResearchActive] = useState(false);
    const [attachDropdownOpen, setAttachDropdownOpen] = useState(false);
    // ── Portfolio picker ────────────────────────────────────────────────────────
    const [portfolioPickerOpen, setPortfolioPickerOpen] = useState(false);
    const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
    const [portfolioItemsLoading, setPortfolioItemsLoading] = useState(false);
    const [portfolioSearch, setPortfolioSearch] = useState("");
    const [historyLoading, setHistoryLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTipIndex, setActiveTipIndex] = useState(0);
    const [queuedFollowUp, setQueuedFollowUpState] = useState<ChatDraft | null>(null);
    // ── Autocomplete state ──────────────────────────────────────────────────────
    const [acItems, setAcItems] = useState<ItemSearchResult[]>([]);
    const [acItemsLoading, setAcItemsLoading] = useState(false);
    const [acSelectedIndex, setAcSelectedIndex] = useState(-1);
    const acDebounceRef = useRef<number | null>(null);
    const attachDropdownRef = useRef<HTMLDivElement>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const streamAbortControllerRef = useRef<AbortController | null>(null);
    const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const streamIdleTimeoutRef = useRef<number | null>(null);
    const messagesRef = useRef<ChatMessage[]>([]);
    const activeSessionIdRef = useRef<string | null>(null);
    const queuedFollowUpRef = useRef<ChatDraft | null>(null);
    const submitInFlightRef = useRef(false);
    const providerTouchedRef = useRef(false);
    const isMountedRef = useRef(true);
    const pendingSelectionRef = useRef<number | null>(null);

    const setQueuedFollowUp = useCallback((draft: ChatDraft | null) => {
        queuedFollowUpRef.current = draft;
        setQueuedFollowUpState(draft);
    }, []);

    const rotateActiveTip = useCallback(() => {
        setActiveTipIndex((currentIndex) => getNextTipIndex(currentIndex));
    }, []);

    const clearStreamIdleTimeout = useCallback(() => {
        if (streamIdleTimeoutRef.current !== null) {
            window.clearTimeout(streamIdleTimeoutRef.current);
            streamIdleTimeoutRef.current = null;
        }
    }, []);

    const insertSelectedItemMention = useCallback((selectedItem: AegisSelectedItem) => {
        const textarea = inputRef.current;
        const mention = formatItemMention(selectedItem.hashName);
        const currentValue = input;
        const selectionStart = textarea?.selectionStart ?? currentValue.length;
        const selectionEnd = textarea?.selectionEnd ?? currentValue.length;
        const previousChar = currentValue.slice(Math.max(0, selectionStart - 1), selectionStart);
        const nextChar = currentValue.slice(selectionEnd, selectionEnd + 1);
        const prefix = selectionStart > 0 && previousChar.trim().length > 0 ? " " : "";
        const suffix = nextChar.trim().length > 0 ? " " : "";
        const nextValue = `${currentValue.slice(0, selectionStart)}${prefix}${mention}${suffix}${currentValue.slice(selectionEnd)}`;

        if (nextValue.length > MAX_MESSAGE_LENGTH) {
            setError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
            return;
        }

        pendingSelectionRef.current = selectionStart + prefix.length + mention.length;
        setError(null);
        setInput(nextValue);
    }, [input]);

    const loadHistory = useCallback(async (sessionId: string) => {
        setHistoryLoading(true);
        try {
            const res = await fetch(`/api/chat/history?sessionId=${sessionId}`);
            const data = await res.json();
            if (data.success && data.data && data.data.length > 0) {
                const hydratedMessages = await Promise.all((data.data as PersistedChatMessage[]).map(async (m) => {
                    const metadata = parseMessageMetadata(m.metadata);
                    const baseMessage = createChatMessage({
                        role: m.role === "assistant" ? "assistant" : "user",
                        content: m.content,
                    });

                    if (m.role !== "assistant" || !metadata.durableRunId) {
                        return baseMessage;
                    }

                    const run = await fetchAegisRun(metadata.durableRunId);
                    return {
                        ...baseMessage,
                        provider: metadata.provider,
                        agentMode: metadata.agentMode,
                        reasoningDepth: metadata.reasoningDepth,
                        openRouterModelId: metadata.openRouterModelId,
                        content: run ? getRunDisplayContent(run, m.content) : m.content,
                        aegisEvents: run ? mapRunToAegisEvents(run) : undefined,
                    };
                }));
                setMessages(hydratedMessages);
            } else {
                setMessages([createChatMessage(WELCOME_MESSAGE)]);
            }
        } catch (error) {
            console.error("[AIChat] Failed to load chat history", error);
            setMessages([createChatMessage({
                role: "assistant",
                content: WELCOME_MESSAGE.content,
            })]);
            setError("Could not load chat history. You can still start a new conversation.");
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    const createChatSession = useCallback(async (title = "New Chat"): Promise<ChatSessionData | null> => {
        try {
            const res = await fetch("/api/chat/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title }),
            });
            const data = await res.json() as ChatSessionResponse;
            if (data.success && data.data) {
                return data.data;
            }

            if (data.error) {
                setError(data.error);
            }
        } catch (error) {
            console.error("[AIChat] Failed to create chat session", error);
            setError("Failed to create new chat session.");
        }

        return null;
    }, []);

    useEffect(() => {
        setSessionsLoading(true);
        fetch("/api/chat/sessions")
            .then(res => res.json())
            .then((data) => {
                if (!data.success && typeof data.error === "string") {
                    setError(data.error);
                }
                if (data.success && data.data && data.data.length > 0) {
                    setSessions(data.data);
                }
                if (initialSessionId) {
                    setActiveSessionId(initialSessionId);
                    void loadHistory(initialSessionId);
                } else {
                    setActiveSessionId(null);
                    setMessages([createChatMessage(WELCOME_MESSAGE)]);
                }
            })
            .catch((error) => {
                console.warn("[AIChat] Failed to load chat sessions", error);
                if (initialSessionId) {
                    setActiveSessionId(initialSessionId);
                    void loadHistory(initialSessionId);
                } else {
                    setMessages([createChatMessage(WELCOME_MESSAGE)]);
                }
            })
            .finally(() => setSessionsLoading(false));
    }, [initialSessionId, loadHistory]);

    useEffect(() => {
        let ignored = false;

        fetch("/api/settings")
            .then(res => res.json())
            .then((data) => {
                const settingsData = data?.data ?? data;
                const activeProvider = settingsData?.activeAIProvider;
                if (!ignored && typeof activeProvider === "string" && isAIProviderName(activeProvider) && !providerTouchedRef.current) {
                    setProvider(activeProvider);
                    setReasoningDepth(getDefaultReasoningDepthForModel(activeProvider));
                }
            })
            .catch((error) => {
                console.warn("[AIChat Settings] Failed to load provider settings; using chat route fallback.", error);
            })
            .finally(() => {
                if (!ignored) setSettingsLoading(false);
            });

        return () => {
            ignored = true;
        };
    }, []);
    useEffect(() => {
        if (initialSessionId !== undefined && initialSessionId !== activeSessionId) {
            setActiveSessionId(initialSessionId);
            if (initialSessionId) {
                void loadHistory(initialSessionId);
            } else {
                setMessages([createChatMessage(WELCOME_MESSAGE)]);
            }
        }
    }, [initialSessionId, loadHistory]);

    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname;
            const match = path.match(/^\/chat\/([^\/]+)$/);
            if (match) {
                const sessionId = match[1];
                setActiveSessionId(sessionId);
                void loadHistory(sessionId);
            } else if (path === "/chat") {
                setActiveSessionId(null);
                setMessages([createChatMessage(WELCOME_MESSAGE)]);
            }
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [loadHistory]);
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            clearStreamIdleTimeout();
            const activeReader = streamReaderRef.current;
            const activeController = streamAbortControllerRef.current;
            streamReaderRef.current = null;
            streamAbortControllerRef.current = null;
            submitInFlightRef.current = false;
            activeController?.abort();
            void activeReader?.cancel().catch((error: unknown) => {
                console.warn("[AIChat] Failed to cancel active stream reader on unmount", error);
            });
        };
    }, [clearStreamIdleTimeout]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        activeSessionIdRef.current = activeSessionId;
    }, [activeSessionId]);

    useEffect(() => {
        const options = getReasoningDepthOptionsForModel(provider);
        if (options.length === 0) {
            if (reasoningDepth) {
                setReasoningDepth(undefined);
            }
            return;
        }

        if (!reasoningDepth || !options.some((option) => option.value === reasoningDepth)) {
            setReasoningDepth(getDefaultReasoningDepthForModel(provider) ?? options[0].value);
        }
    }, [provider, reasoningDepth]);

    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    useEffect(() => {
        if (pendingSelectionRef.current === null || !inputRef.current) {
            return;
        }

        const caretPosition = pendingSelectionRef.current;
        pendingSelectionRef.current = null;

        requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.setSelectionRange(caretPosition, caretPosition);
        });
    }, [input]);

    useEffect(() => {
        function handleSelectedItem(event: Event) {
            const { detail } = event as CustomEvent<AegisSelectedItem>;
            if (!detail?.hashName) {
                return;
            }

            insertSelectedItemMention(detail);
        }

        window.addEventListener(AEGIS_ITEM_SELECTED_EVENT, handleSelectedItem);
        return () => window.removeEventListener(AEGIS_ITEM_SELECTED_EVENT, handleSelectedItem);
    }, [insertSelectedItemMention]);

    const handleSwitchSession = async (sessionId: string) => {
        if (sessionId === activeSessionId || isLoading) return;
        streamAbortControllerRef.current?.abort();
        setActiveSessionId(sessionId);
        setInput("");
        setAttachedImage(null);
        setAttachedPortfolioItem(null);
        setDeepResearchActive(false);
        setError(null);
        window.history.pushState(null, "", `/chat/${sessionId}`);
        await loadHistory(sessionId);
    };

    const handleNewChat = () => {
        if (isLoading) return;
        setActiveSessionId(null);
        setMessages([createChatMessage(WELCOME_MESSAGE)]);
        setInput("");
        setAttachedImage(null);
        setAttachedPortfolioItem(null);
        setDeepResearchActive(false);
        setError(null);
        rotateActiveTip();
        window.history.pushState(null, "", "/chat");
    };

    // ── Portfolio picker fetch ───────────────────────────────────────────────────
    const fetchPortfolioItems = useCallback(async () => {
        if (portfolioItemsLoading) return;
        setPortfolioItemsLoading(true);
        try {
            const res = await fetch("/api/portfolio");
            const data = await res.json();
            if (data.success && Array.isArray(data.data?.items)) {
                setPortfolioItems(data.data.items as PortfolioItem[]);
            } else {
                setPortfolioItems([]);
            }
        } catch (error) {
            console.warn("[AIChat] Failed to load portfolio items", error);
            setPortfolioItems([]);
        } finally {
            setPortfolioItemsLoading(false);
        }
    }, [portfolioItemsLoading]);

    const openPortfolioPicker = useCallback(() => {
        setAttachDropdownOpen(false);
        setPortfolioSearch("");
        setPortfolioPickerOpen(true);
        void fetchPortfolioItems();
    }, [fetchPortfolioItems]);

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (isLoading) return;

        try {
            const res = await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) return;

            const remaining = sessions.filter(s => s.id !== sessionId);

            if (remaining.length === 0) {
                handleNewChat();
                return;
            }

            setSessions(remaining);

            if (activeSessionId === sessionId) {
                const nextSession = remaining[0];
                setActiveSessionId(nextSession.id);
                window.history.replaceState(null, "", `/chat/${nextSession.id}`);
                await loadHistory(nextSession.id);
            }
        } catch (error) {
            console.warn("[AIChat] Failed to delete chat session", error);
            setError("Failed to delete chat session.");
        }
    };

    const handleStop = () => {
        const activeController = streamAbortControllerRef.current;
        const activeReader = streamReaderRef.current;
        setQueuedFollowUp(null);
        clearStreamIdleTimeout();
        streamReaderRef.current = null;
        streamAbortControllerRef.current = null;
        submitInFlightRef.current = false;
        activeController?.abort();
        void activeReader?.cancel().catch((error: unknown) => {
            console.warn("[AIChat] Failed to cancel active stream reader", error);
        });
        setIsLoading(false);
    };

    const pollAegisRunIntoMessage = useCallback(async (runId: string, assistantMessageId: string, fallback: string, startedAt: number, signal: AbortSignal) => {
        for (let attempt = 0; attempt < AEGIS_RUN_MAX_POLL_ATTEMPTS; attempt++) {
            if (signal.aborted) return;

            const run = await fetchAegisRun(runId);
            if (run) {
                const content = getRunDisplayContent(run, fallback);
                const aegisEvents = mapRunToAegisEvents(run);
                const reasoningDurationMs = performance.now() - startedAt;

                setMessages(prev => {
                    const nextMessages = prev.map(message => {
                        if (message.id !== assistantMessageId || message.role !== "assistant") {
                            return message;
                        }

                        return {
                            ...message,
                            content,
                            aegisEvents,
                            reasoningDurationMs,
                        };
                    });
                    messagesRef.current = nextMessages;
                    return nextMessages;
                });

                if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
                    return;
                }
            }

            await waitForNextRunPoll();
        }

        if (!signal.aborted) {
            setMessages(prev => {
                const nextMessages = prev.map(message => {
                    if (message.id !== assistantMessageId || message.role !== "assistant") {
                        return message;
                    }

                    return {
                        ...message,
                        content: message.content.trim() ? message.content : "Aegis is still running. Reopen this chat in a moment to see the durable result.",
                        reasoningDurationMs: performance.now() - startedAt,
                    };
                });
                messagesRef.current = nextMessages;
                return nextMessages;
            });
        }
    }, []);

    const submitDraft = async (draft: ChatDraft, portfolioItemOverride?: AttachedPortfolioItem | null) => {
        const portfolioItemContext = portfolioItemOverride !== undefined ? portfolioItemOverride : attachedPortfolioItem;
        if (!draft.content && !draft.imageBase64 && !portfolioItemContext) return;
        submitInFlightRef.current = true;

        const previousReader = streamReaderRef.current;
        clearStreamIdleTimeout();
        streamReaderRef.current = null;
        streamAbortControllerRef.current?.abort();
        void previousReader?.cancel().catch((error: unknown) => {
            console.warn("[AIChat] Failed to cancel previous stream reader", error);
        });

        const controller = new AbortController();
        streamAbortControllerRef.current = controller;

        const previousConversationMessages = messagesRef.current.filter(message => !isWelcomeMessage(message));

        // Build content, appending portfolio item context if present
        const baseContent = draft.content || (draft.imageBase64 ? "[Attached Image]" : "");
        const itemContextSuffix = portfolioItemContext
            ? `\n\n[Attached portfolio item: ${portfolioItemContext.name} (${portfolioItemContext.marketHashName}); portfolio item ${portfolioItemContext.id}${portfolioItemContext.currentPrice !== null ? ` — Current price: $${portfolioItemContext.currentPrice.toFixed(2)}` : ""}]`
            : "";

        const userMessagePayload: ChatMessageData = {
            role: "user" as const,
            content: baseContent + itemContextSuffix,
        };
        if (draft.imageBase64) {
            userMessagePayload.imageBase64 = draft.imageBase64;
        }
        setAttachedPortfolioItem(null);
        const deepResearch = deepResearchActive;
        setDeepResearchActive(false);

        const userMsg = createChatMessage(userMessagePayload);
        const assistantStartedAt = performance.now();
        const selectedOpenRouterModelId = provider === "openrouter" ? openRouterModelId.trim() : undefined;
        const assistantPlaceholder: ChatMessage = {
            ...createChatMessage({ role: "assistant", content: "" }),
            provider,
            agentMode,
            ...(reasoningDepth ? { reasoningDepth } : {}),
            ...(selectedOpenRouterModelId ? { openRouterModelId: selectedOpenRouterModelId } : {}),
        };

        setMessages(prev => {
            const nextMessages = [...prev, userMsg, assistantPlaceholder];
            messagesRef.current = nextMessages;
            return nextMessages;
        });
        setInput("");
        setAttachedImage(null);
        setIsLoading(true);

        let sessionIdForRequest = activeSessionIdRef.current;
        const isFirstMessage = previousConversationMessages.length === 0;
        if (isFirstMessage) {
            const newTitle = userMessagePayload.content.slice(0, 80) || "New Chat";
            if (sessionIdForRequest) {
                setSessions(prev => prev.map(s =>
                    s.id === sessionIdForRequest ? { ...s, title: newTitle } : s
                ));
            } else {
                const newSession = await createChatSession(newTitle);
                if (newSession) {
                    sessionIdForRequest = newSession.id;
                    activeSessionIdRef.current = newSession.id;
                    setSessions(prev => [newSession, ...prev]);
                    setActiveSessionId(newSession.id);
                    rotateActiveTip();
                    window.history.replaceState(null, "", `/chat/${newSession.id}`);
                }
            }
        }

        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

        try {
            const contextMessages = [...previousConversationMessages, userMessagePayload]
                .slice(-MAX_CONTEXT_MESSAGES)
                .map(({ role, content, imageBase64 }, idx, arr) => ({
                    role,
                    content,
                    ...(idx === arr.length - 1 && imageBase64 ? { imageBase64 } : {}),
                }));

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: contextMessages,
                    ...(!settingsLoading || providerTouchedRef.current ? { provider } : {}),
                    ...(reasoningDepth ? { reasoningDepth } : {}),
                    ...(provider === "openrouter" && selectedOpenRouterModelId ? { openRouterModelId: selectedOpenRouterModelId } : {}),
                    agentMode,
                    ...(sessionIdForRequest ? { sessionId: sessionIdForRequest } : {}),
                    ...(deepResearch ? { deepResearch: true } : {}),
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                let errorMessage = "API Error";
                const contentType = res.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                    let data: { error?: string } | null = null;
                    try {
                        data = await res.json() as { error?: string };
                    } catch (error) {
                        console.warn("[AIChat] Failed to parse chat error response", error);
                    }
                    if (data && typeof data.error === "string") {
                        errorMessage = data.error;
                    }
                } else {
                    const errorText = await res.text();
                    if (errorText) errorMessage = errorText;
                }
                throw new Error(errorMessage);
            }
            if (!res.body) throw new Error("No response body");

            reader = res.body.getReader();
            const activeReader = reader;
            const decoder = new TextDecoder("utf-8");
            let receivedAssistantChunk = false;
            let aegisStreamRemainder = "";
            let queuedRunId: string | null = null;
            streamReaderRef.current = activeReader;

            const finalizeAssistantResponse = () => {
                const reasoningDurationMs = performance.now() - assistantStartedAt;
                setMessages(prev => {
                    const nextMessages = prev.map(message => {
                        if (message.id !== assistantPlaceholder.id || message.role !== "assistant") {
                            return message;
                        }

                        return { ...message, reasoningDurationMs };
                    });
                    messagesRef.current = nextMessages;
                    return nextMessages;
                });
            };

            const readWithIdleCompletion = async (): Promise<ReadableStreamReadResult<Uint8Array> | "idle-complete"> => {
                if (!receivedAssistantChunk) {
                    return activeReader.read();
                }

                return new Promise<ReadableStreamReadResult<Uint8Array> | "idle-complete">((resolve, reject) => {
                    clearStreamIdleTimeout();
                    const timeoutId = window.setTimeout(() => {
                        if (streamAbortControllerRef.current !== controller || streamReaderRef.current !== activeReader) {
                            return;
                        }

                        if (streamIdleTimeoutRef.current === timeoutId) {
                            streamIdleTimeoutRef.current = null;
                        }
                        resolve("idle-complete");
                    }, STREAM_IDLE_COMPLETION_TIMEOUT_MS);
                    streamIdleTimeoutRef.current = timeoutId;

                    const clearReadTimeout = () => {
                        if (streamIdleTimeoutRef.current === timeoutId) {
                            streamIdleTimeoutRef.current = null;
                        }

                        window.clearTimeout(timeoutId);
                    };

                    activeReader.read().then(
                        (result) => {
                            clearReadTimeout();
                            resolve(result);
                        },
                        (error: unknown) => {
                            clearReadTimeout();
                            reject(error);
                        }
                    );
                });
            };

            while (!controller.signal.aborted) {
                const result = await readWithIdleCompletion();
                if (result === "idle-complete") {
                    streamReaderRef.current = null;
                    void activeReader.cancel().catch((error: unknown) => {
                        console.warn("[AIChat] Failed to cancel idle stream reader", error);
                    });
                    break;
                }

                const { done, value } = result;
                if (done || controller.signal.aborted) break;

                const chunk = decoder.decode(value, { stream: true });
                const parsed = parseAegisStreamChunk(aegisStreamRemainder + chunk);
                aegisStreamRemainder = parsed.remainder;
                for (const event of parsed.events) {
                    queuedRunId = queuedRunId ?? getQueuedRunId(event);
                }
                const aegisEvents = parsed.events.filter(event => event.type !== "aegis.delta" && event.type !== "aegis.done");
                const assistantText = parsed.rawText + parsed.events
                    .filter(event => event.type === "aegis.delta" && typeof event.message === "string")
                    .map(event => event.message)
                    .join("");

                if (!assistantText && aegisEvents.length === 0) {
                    continue;
                }

                if (assistantText) {
                    receivedAssistantChunk = true;
                }

                setMessages(prev => {
                    const nextMessages = prev.map(message => {
                        if (message.id !== assistantPlaceholder.id || message.role !== "assistant") {
                            return message;
                        }

                        return {
                            ...message,
                            content: assistantText ? message.content + assistantText : message.content,
                            aegisEvents: aegisEvents.length > 0
                                ? [...(message.aegisEvents ?? []), ...aegisEvents]
                                : message.aegisEvents,
                        };
                    });
                    messagesRef.current = nextMessages;
                    return nextMessages;
                });
            }

            clearStreamIdleTimeout();
            if (queuedRunId) {
                await pollAegisRunIntoMessage(
                    queuedRunId,
                    assistantPlaceholder.id,
                    "Aegis run queued. Waiting for the durable runner to finish...",
                    assistantStartedAt,
                    controller.signal
                );
            }
            finalizeAssistantResponse();
        } catch (error) {
            clearStreamIdleTimeout();

            if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
                if (isMountedRef.current) {
                    setMessages(prev => {
                        const placeholder = prev.find(m => m.id === assistantPlaceholder.id);
                        if (placeholder && (placeholder.content.trim() || hasRenderableAegisEvents(placeholder))) {
                            messagesRef.current = prev;
                            return prev;
                        }
                        const nextMessages = prev.filter(message => message.id !== assistantPlaceholder.id);
                        messagesRef.current = nextMessages;
                        return nextMessages;
                    });
                }
                return;
            }

            console.error("Chat error:", error);
            const errorMessage = error instanceof Error && error.message
                ? error.message
                : "Sorry, I encountered an error while processing your request. Please check your AI provider settings and try again.";
            setMessages(prev => {
                const nextMessages = prev.map(message => {
                    if (message.id !== assistantPlaceholder.id) {
                        return message;
                    }

                    return {
                        ...message,
                        content: errorMessage,
                        reasoningDurationMs: performance.now() - assistantStartedAt,
                    };
                });
                messagesRef.current = nextMessages;
                return nextMessages;
            });
            if (streamAbortControllerRef.current === controller) {
                streamAbortControllerRef.current = null;
            }
            if (isMountedRef.current) {
                setQueuedFollowUp(null);
                submitInFlightRef.current = false;
                setIsLoading(false);
            }
        } finally {
            clearStreamIdleTimeout();

            if (streamReaderRef.current === reader) {
                streamReaderRef.current = null;
            }

            if (streamAbortControllerRef.current === controller) {
                streamAbortControllerRef.current = null;

                if (isMountedRef.current) {
                    const nextQueuedFollowUp = queuedFollowUpRef.current;
                    if (!controller.signal.aborted && nextQueuedFollowUp) {
                        setQueuedFollowUp(null);
                        void submitDraft(nextQueuedFollowUp).catch((error: unknown) => {
                            console.error("[AIChat] Queued follow-up submit unexpectedly failed", error);
                            // Safety net: submitDraft has its own try/catch/finally and
                            // should never reject, but if it does, release the lock so
                            // the UI is not permanently stuck in isLoading=true.
                            if (isMountedRef.current) {
                                submitInFlightRef.current = false;
                                setIsLoading(false);
                            }
                        });
                    } else {
                        // Aborted or no follow-up: release lock AND clear any stale
                        // queued-follow-up banner so the UI does not show an orphaned
                        // "Queued follow-up" notice after Stop is clicked.
                        setQueuedFollowUp(null);
                        submitInFlightRef.current = false;
                        setIsLoading(false);
                    }
                }
            }
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        const rawInput = input.trim();
        setAcItems([]);
        setAcSelectedIndex(-1);

        // ── Slash-command interception ─────────────────────────────────────────
        const parsed = parseSlashCommand(rawInput);
        if (parsed) {
            if (parsed.command === "/watch") {
                await handleWatchCommand(parsed.args);
                return;
            }
            if (parsed.command === "/analyze" && parsed.args) {
                const prompt = buildAnalyzePrompt(parsed.args);
                // Switch to researcher for deep analysis
                if (agentMode !== "researcher") setAgentMode("researcher");
                await submitDraft({ content: prompt, imageBase64: attachedImage });
                setInput("");
                setAttachedImage(null);
                return;
            }
            if (parsed.command === "/compare" && parsed.args) {
                const prompt = buildComparePrompt(parsed.args);
                await submitDraft({ content: prompt, imageBase64: attachedImage });
                setInput("");
                setAttachedImage(null);
                return;
            }
            if (parsed.command === "/portfolio") {
                const prompt = buildPortfolioPrompt();
                await submitDraft({ content: prompt, imageBase64: attachedImage });
                setInput("");
                setAttachedImage(null);
                return;
            }
        }
        // ── Normal flow ───────────────────────────────────────────────────────
        const draft: ChatDraft = {
            content: rawInput,
            imageBase64: attachedImage,
        };

        if (!draft.content && !draft.imageBase64 && !attachedPortfolioItem) return;

        if (submitInFlightRef.current && !isLoading) {
            return;
        }

        if (isLoading) {
            setQueuedFollowUp(draft);
            setInput("");
            setAttachedImage(null);
            setAttachedPortfolioItem(null);
            setError(null);
            return;
        }

        await submitDraft(draft);
    };

    const handleImageUpload = (file: File) => {
        if (!file.type.startsWith("image/")) {
            setError("Please upload an image file.");
            return;
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            setError(`Image too large. Maximum size is ${MAX_IMAGE_SIZE_MB}MB.`);
            return;
        }
        setError(null);
        const reader = new FileReader();
        reader.onloadend = () => {
            setAttachedImage(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                if (file) handleImageUpload(file);
                e.preventDefault();
                break;
            }
        }
    };

    // ── Item autocomplete fetcher ────────────────────────────────────────────────
    const fetchItemSuggestions = useCallback((q: string) => {
        if (acDebounceRef.current !== null) {
            window.clearTimeout(acDebounceRef.current);
        }
        if (!q || q.length < 2) {
            setAcItems([]);
            setAcItemsLoading(false);
            return;
        }
        setAcItemsLoading(true);
        acDebounceRef.current = window.setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                if (data.success && Array.isArray(data.data?.results)) {
                    setAcItems(data.data.results as ItemSearchResult[]);
                } else {
                    setAcItems([]);
                }
            } catch (error) {
                console.warn("[AIChat] Failed to fetch item suggestions", error);
                setAcItems([]);
            } finally {
                setAcItemsLoading(false);
            }
        }, ITEM_AUTOCOMPLETE_DEBOUNCE_MS);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        if (value.length > MAX_MESSAGE_LENGTH) {
            setError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
            return;
        }
        setError(null);
        setInput(value);
        setAcSelectedIndex(-1);
        // Trigger item autocomplete when relevant
        const itemQuery = getItemSearchQuery(value);
        if (itemQuery) {
            fetchItemSuggestions(itemQuery);
        } else {
            setAcItems([]);
            setAcItemsLoading(false);
        }
    };

    // Derived autocomplete visibility
    const showCommandPalette = isShowingCommandPalette(input);
    const parsedCmd = parseSlashCommand(input);
    const showItemAutocomplete = !showCommandPalette && parsedCmd !== null &&
        ["analyze", "compare", "watch"].some((c) => parsedCmd.command === `/${c}`) &&
        (acItems.length > 0 || acItemsLoading);
    const commandPrefix = getCommandPrefix(input).toLowerCase();
    const filteredCommands = SLASH_COMMANDS.filter(
        (cmd) => commandPrefix === "/" || cmd.name.startsWith(commandPrefix)
    );

    // ── /watch client-side handler ───────────────────────────────────────────────
    const handleWatchCommand = useCallback(async (args: string): Promise<void> => {
        const hashName = args.replace(/@item\[([^\]]+)\]/g, "$1").trim();
        if (!hashName) {
            setError("Please specify an item name after /watch.");
            return;
        }
        const userMsg = createChatMessage({ role: "user", content: `/watch ${args}` });
        const assistantMsg = createChatMessage({ role: "assistant", content: "" });
        setMessages((prev) => {
            const next = [...prev, userMsg, assistantMsg];
            messagesRef.current = next;
            return next;
        });
        setInput("");
        setIsLoading(true);
        try {
            const res = await fetch("/api/watchlist/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hashName }),
            });
            const data = await res.json();
            const reply = data.message ?? (data.success ? `✅ **${hashName}** added to Watchlist.` : `❌ Could not add **${hashName}** to Watchlist.`);
            setMessages((prev) => {
                const next = prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: reply, agentMode: "consultant" as AIAgentMode, provider, reasoningDurationMs: 0 } : m
                );
                messagesRef.current = next;
                return next;
            });
        } catch (error) {
            console.warn("[AIChat] Failed to run watch command", error);
            setMessages((prev) => {
                const next = prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, content: "❌ Network error — could not reach Watchlist API.", agentMode: "consultant" as AIAgentMode, provider, reasoningDurationMs: 0 } : m
                );
                messagesRef.current = next;
                return next;
            });
        } finally {
            setIsLoading(false);
        }
    }, [provider]);

    const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Arrow navigation in autocomplete popovers
        if (showCommandPalette || showItemAutocomplete) {
            const listLength = showCommandPalette ? filteredCommands.length : acItems.length;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setAcSelectedIndex((idx) => Math.min(idx + 1, listLength - 1));
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setAcSelectedIndex((idx) => Math.max(idx - 1, 0));
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setInput("");
                setAcItems([]);
                setAcSelectedIndex(-1);
                return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
                if (showCommandPalette) {
                    const idx = acSelectedIndex >= 0 ? acSelectedIndex : 0;
                    const cmd = filteredCommands[idx];
                    if (cmd) {
                        e.preventDefault();
                        setInput(cmd.name + " ");
                        setAcSelectedIndex(-1);
                        setAcItems([]);
                        requestAnimationFrame(() => inputRef.current?.focus());
                        return;
                    }
                }
                if (showItemAutocomplete) {
                    const idx = acSelectedIndex >= 0 ? acSelectedIndex : 0;
                    const item = acItems[idx];
                    if (item && e.key === "Tab") {
                        e.preventDefault();
                        insertSelectedItemMention({ hashName: item.hashName, id: item.id, name: item.name, imageUrl: item.imageUrl, category: item.category, rarity: item.rarity, exterior: item.exterior, type: item.type });
                        setAcItems([]);
                        setAcSelectedIndex(-1);
                        return;
                    }
                }
            }
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
        }
    };

    const handleProviderChange = (nextProvider: AIProviderName) => {
        providerTouchedRef.current = true;
        setProvider(nextProvider);
        setReasoningDepth(getDefaultReasoningDepthForModel(nextProvider));
    };

    const handleOpenRouterModelChange = (value: string) => {
        if (value.length > MAX_OPENROUTER_MODEL_ID_LENGTH) {
            setError(`OpenRouter model id must be ${MAX_OPENROUTER_MODEL_ID_LENGTH} characters or fewer.`);
            return;
        }

        setError(null);
        setOpenRouterModelId(value.replace(/[\u0000-\u001f\u007f]/g, ""));
    };

    const handleOpenRouterModelBlur = () => {
        setOpenRouterModelId((currentValue) => currentValue.trim() || DEFAULT_OPENROUTER_MODEL_ID);
    };

    const handleAegisRefetch = useCallback(() => {
        router.refresh();
    }, [router]);

    const visibleMessages = messages.filter(message => !isWelcomeMessage(message));
    const hasStartedConversation = visibleMessages.length > 0;
    const activeSession = sessions.find(session => session.id === activeSessionId);
    const filteredSessions = searchQuery.trim()
        ? sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : sessions;
    const activeReasoningOptions = getReasoningDepthOptionsForModel(provider);
    const activeTip = AEGIS_TIPS[activeTipIndex];

    const renderAssistantMetadata = (message: ChatMessage) => {
        const messageAgentMode = message.agentMode ?? agentMode;
        const messageProvider = message.provider ?? provider;
        const messageModel = getModelByValue(messageProvider);
        const messageAgentLabel = AI_AGENT_MODE_OPTIONS.find(option => option.value === messageAgentMode)?.label ?? messageAgentMode;
        const messageModelLabel = messageProvider === "openrouter" && message.openRouterModelId
            ? `${messageModel?.shortLabel ?? "OpenRouter"}: ${getOpenRouterModelLabel(message.openRouterModelId)}`
            : messageModel?.shortLabel ?? messageProvider;
        const agentColorClassName = getAgentClassName(messageAgentMode);

        return (
            <div className={styles.assistantMeta} aria-label={`Aegis response metadata: ${messageAgentLabel}, ${messageModelLabel}, ${formatReasoningDuration(message.reasoningDurationMs)}`}>
                <span className={`${styles.assistantMetaIdentity} ${agentColorClassName}`}>
                    <span className={styles.assistantMetaIcon} aria-hidden="true">
                        <span />
                    </span>
                    <span>{messageAgentLabel}</span>
                </span>
                <span className={styles.assistantMetaSeparator} aria-hidden="true">·</span>
                <span>{messageModelLabel}</span>
                <span className={styles.assistantMetaSeparator} aria-hidden="true">·</span>
                <span>{formatReasoningDuration(message.reasoningDurationMs)}</span>
            </div>
        );
    };

    const renderAegisEvents = (message: ChatMessage) => {
        if (!Array.isArray(message.aegisEvents) || message.aegisEvents.length === 0) {
            return null;
        }

        const visibleEvents = message.aegisEvents.filter((event) => RENDERABLE_AEGIS_EVENT_TYPES.has(event.type));
        if (visibleEvents.length === 0) {
            return null;
        }

        return (
            <div className={styles.aegisEvents} aria-label="Aegis action events">
                {visibleEvents.map((event, index) => (
                    <AegisActionCard
                        key={`${message.id}-${event.type}-${event.sequence ?? index}`}
                        event={event}
                        onRefetch={handleAegisRefetch}
                    />
                ))}
            </div>
        );
    };

    const agentOptions = AI_AGENT_MODE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        className: getAgentClassName(option.value),
    }));
    const modelOptions = AI_MODELS.map((model) => ({
        value: model.value,
        label: model.shortLabel,
        icon: <ProviderIcon provider={model.value} />,
    }));
    const reasoningOptions = activeReasoningOptions.map((option) => ({
        value: option.value,
        label: option.shortLabel,
        className: getReasoningClassName(),
    }));

    // ── Command colour helper ────────────────────────────────────────────────────
    const commandChipClass = (cmd: SlashCommandName): string => {
        const map: Record<SlashCommandName, string> = {
            "/analyze": styles.commandChipAnalyze,
            "/compare": styles.commandChipCompare,
            "/watch": styles.commandChipWatch,
            "/portfolio": styles.commandChipPortfolio,
        };
        return map[cmd] ?? "";
    };

    const commandNameClass = (cmd: string): string => {
        const map: Record<string, string> = {
            "/analyze": styles.commandNameAnalyze,
            "/compare": styles.commandNameCompare,
            "/watch": styles.commandNameWatch,
            "/portfolio": styles.commandNamePortfolio,
        };
        return map[cmd] ?? "";
    };

    const filteredPortfolioItems = portfolioSearch.trim()
        ? portfolioItems.filter(item =>
            item.name.toLowerCase().includes(portfolioSearch.toLowerCase()) ||
            item.marketHashName.toLowerCase().includes(portfolioSearch.toLowerCase())
        )
        : portfolioItems;

    const renderComposer = (centered: boolean) => (
        <form className={`${styles.inputArea} ${centered ? styles.inputAreaCentered : ""}`} onSubmit={handleSubmit}>
            {(attachedImage || attachedPortfolioItem || deepResearchActive) && (
                <div className={styles.attachmentsRow}>
                    {attachedImage && (
                        <div className={styles.imagePreviewContainer}>
                            <img src={attachedImage} alt="Attached" className={styles.imagePreview} />
                            <button type="button" className={styles.clearImageBtn} onClick={() => setAttachedImage(null)} aria-label="Remove image"><FaTimes /></button>
                        </div>
                    )}
                    {attachedPortfolioItem && (
                        <div className={styles.portfolioAttachBlock}>
                            {attachedPortfolioItem.imageUrl ? (
                                <img src={attachedPortfolioItem.imageUrl} alt={attachedPortfolioItem.name} className={styles.portfolioAttachImg} />
                            ) : (
                                <span className={styles.portfolioAttachImgPlaceholder} aria-hidden="true">🔫</span>
                            )}
                            <div className={styles.portfolioAttachMeta}>
                                <span className={styles.portfolioAttachName}>{attachedPortfolioItem.name}</span>
                                {attachedPortfolioItem.currentPrice !== null && (
                                    <span className={styles.portfolioAttachPrice}>${attachedPortfolioItem.currentPrice.toFixed(2)}</span>
                                )}
                            </div>
                            <button
                                type="button"
                                className={styles.clearImageBtn}
                                onClick={() => setAttachedPortfolioItem(null)}
                                aria-label="Remove portfolio item attachment"
                            >
                                <FaTimes />
                            </button>
                        </div>
                    )}
                    {deepResearchActive && (
                        <div className={styles.researchAttachBlock}>
                            <div className={styles.researchAttachIcon}>
                                <FaGlobe />
                            </div>
                            <div className={styles.portfolioAttachMeta}>
                                <span className={styles.portfolioAttachName}>Deep Research Mode</span>
                                <span className={styles.portfolioAttachPrice}>Web search enabled</span>
                            </div>
                            <button
                                type="button"
                                className={styles.clearImageBtn}
                                onClick={() => setDeepResearchActive(false)}
                                aria-label="Disable Deep Research Mode"
                            >
                                <FaTimes />
                            </button>
                        </div>
                    )}
                </div>
            )}
            {error && (
                <div className={styles.errorBanner} role="alert">
                    {error}
                </div>
            )}
            {queuedFollowUp && (
                <div className={styles.queueNotice} role="status">
                    Queued follow-up: {queuedFollowUp.content || "Attached image"}
                </div>
            )}
            <div className={styles.autocompleteWrap}>
                {/* Command palette */}
                {showCommandPalette && filteredCommands.length > 0 && (
                    <div className={styles.commandPalette} role="listbox" aria-label="Aegis commands">
                        <div className={styles.commandPaletteHeader}>Aegis Commands</div>
                        <div className={styles.commandPaletteList}>
                            {filteredCommands.map((cmd, idx) => (
                                <button
                                    key={cmd.name}
                                    type="button"
                                    role="option"
                                    aria-selected={idx === acSelectedIndex}
                                    className={`${styles.commandOption} ${idx === acSelectedIndex ? styles.commandOptionActive : ""}`}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setInput(cmd.name + " ");
                                        setAcSelectedIndex(-1);
                                        requestAnimationFrame(() => inputRef.current?.focus());
                                    }}
                                >
                                    <span className={`${styles.commandName} ${commandNameClass(cmd.name)}`}>{cmd.name}</span>
                                    <span className={styles.commandDesc}>{cmd.description}</span>
                                    {cmd.expectsItem && (
                                        <span className={styles.commandShortcut}>item</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {/* Item autocomplete */}
                {showItemAutocomplete && (
                    <div className={styles.itemAutocomplete} role="listbox" aria-label="CS2 item suggestions">
                        <div className={styles.commandPaletteHeader}>CS2 Items</div>
                        <div className={styles.itemAutocompleteList}>
                            {acItemsLoading && acItems.length === 0 && (
                                <div className={styles.itemLoadingRow}>
                                    <div className={styles.dot} />
                                    <div className={styles.dot} />
                                    <div className={styles.dot} />
                                    Searching Steam Market…
                                </div>
                            )}
                            {!acItemsLoading && acItems.length === 0 && (
                                <div className={styles.itemEmptyRow}>No items found</div>
                            )}
                            {acItems.map((item, idx) => (
                                <button
                                    key={item.hashName}
                                    type="button"
                                    role="option"
                                    aria-selected={idx === acSelectedIndex}
                                    className={`${styles.itemRow} ${idx === acSelectedIndex ? styles.itemRowActive : ""}`}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        insertSelectedItemMention({ hashName: item.hashName, id: item.id, name: item.name, imageUrl: item.imageUrl, category: item.category, rarity: item.rarity, exterior: item.exterior, type: item.type });
                                        setAcItems([]);
                                        setAcSelectedIndex(-1);
                                        requestAnimationFrame(() => inputRef.current?.focus());
                                    }}
                                >
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.name} className={styles.itemThumb} loading="lazy" />
                                    ) : (
                                        <span className={styles.itemThumbPlaceholder} aria-hidden="true">🔫</span>
                                    )}
                                    <span className={styles.itemMeta}>
                                        <span className={styles.itemRowName}>{item.name}</span>
                                        <span className={styles.itemRowSub}>
                                            {item.exterior && <span>{item.exterior}</span>}
                                            {item.rarity && <span>{item.rarity}</span>}
                                        </span>
                                    </span>
                                    {item.price && (
                                        <span className={styles.itemRowPrice}>{item.price}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            <div className={styles.composerShell}>
                {parsedCmd && !showCommandPalette && (
                    <div style={{ display: "flex", alignItems: "center", paddingTop: 4 }}>
                        <span className={`${styles.commandChip} ${commandChipClass(parsedCmd.command)}`}>
                            {parsedCmd.command}
                            <button
                                type="button"
                                className={styles.commandChipClose}
                                aria-label={`Clear ${parsedCmd.command} command`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setInput(""); setAcItems([]); requestAnimationFrame(() => inputRef.current?.focus()); }}
                            ><FaTimes /></button>
                        </span>
                    </div>
                )}
                <textarea
                    ref={inputRef}
                    data-aegis-command-target="true"
                    className={styles.input}
                    placeholder={parsedCmd ? (parsedCmd.command === "/portfolio" ? "Press Enter to review your portfolio…" : "Type item name or @item[…] to select") : "Message Aegis… or type / for commands"}
                    value={input}
                    onChange={handleInputChange}
                    onPaste={handlePaste}
                    onKeyDown={handleComposerKeyDown}
                    rows={centered ? 3 : 2}
                    aria-label="Chat message input"
                />
                <div className={styles.composerToolbar}>
                    <div
                        className={styles.toolbarAttach}
                        ref={attachDropdownRef}
                        onBlur={(e) => {
                            if (!attachDropdownRef.current?.contains(e.relatedTarget as Node)) {
                                setAttachDropdownOpen(false);
                            }
                        }}
                    >
                        <button
                            type="button"
                            className={`${styles.attachBtn} ${attachDropdownOpen ? styles.attachBtnActive : ""}`}
                            onClick={() => setAttachDropdownOpen(prev => !prev)}
                            title="Attach"
                            aria-label="Attach"
                            aria-haspopup="true"
                            aria-expanded={attachDropdownOpen}
                        >
                            <FaPlus />
                        </button>
                        {attachDropdownOpen && (
                            <div className={styles.attachDropdown} role="menu">
                                <button
                                    type="button"
                                    role="menuitem"
                                    className={styles.attachDropdownItem}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setAttachDropdownOpen(false);
                                        fileInputRef.current?.click();
                                    }}
                                >
                                    <FaPaperclip className={styles.attachDropdownIcon} aria-hidden="true" />
                                    <span>Upload file</span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className={styles.attachDropdownItem}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={openPortfolioPicker}
                                >
                                    <FaBriefcase className={styles.attachDropdownIcon} aria-hidden="true" />
                                    <span>Portfolio item</span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={deepResearchActive}
                                    className={`${styles.attachDropdownItem} ${deepResearchActive ? styles.attachDropdownItemActive : ""}`}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setDeepResearchActive(prev => !prev);
                                        setAttachDropdownOpen(false);
                                    }}
                                >
                                    <FaGlobe className={styles.attachDropdownIcon} aria-hidden="true" />
                                    <span>Deep Research</span>
                                </button>
                            </div>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            className={styles.hiddenInput}
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImageUpload(file);
                                if (e.target) e.target.value = "";
                            }}
                        />
                    </div>
                    <div className={styles.controlGroup} aria-label="Aegis chat controls">
                        <AegisTextSelect
                            ariaLabel="Agent selection"
                            className={styles.agentTextSelect}
                            value={agentMode}
                            onChange={(value) => {
                                if (isAIAgentMode(value)) setAgentMode(value);
                            }}
                            disabled={isLoading}
                            options={agentOptions}
                        />
                        <AegisTextSelect
                            ariaLabel="Model selection"
                            className={styles.modelTextSelect}
                            showChevron
                            value={provider}
                            onChange={(value) => {
                                if (isAIProviderName(value)) {
                                    handleProviderChange(value);
                                }
                            }}
                            disabled={isLoading}
                            options={modelOptions}
                        />
                        {provider === "openrouter" && (
                            <label className={styles.openRouterModelControl}>
                                <span className={styles.srOnly}>OpenRouter model</span>
                                <input
                                    className={styles.openRouterModelInput}
                                    type="text"
                                    list="aegis-openrouter-models"
                                    value={openRouterModelId}
                                    maxLength={MAX_OPENROUTER_MODEL_ID_LENGTH}
                                    disabled={isLoading}
                                    onChange={(event) => handleOpenRouterModelChange(event.target.value)}
                                    onBlur={handleOpenRouterModelBlur}
                                    aria-label="OpenRouter model"
                                    placeholder="OpenRouter model"
                                />
                                <datalist id="aegis-openrouter-models">
                                    {OPENROUTER_MODEL_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value} label={option.label} />
                                    ))}
                                </datalist>
                            </label>
                        )}
                        {reasoningDepth && reasoningOptions.length > 0 && (
                            <AegisTextSelect
                                ariaLabel="Reasoning depth selection"
                                value={reasoningDepth}
                                onChange={(value) => {
                                    if (isAIReasoningDepth(value)) setReasoningDepth(value);
                                }}
                                disabled={isLoading}
                                options={reasoningOptions}
                            />
                        )}
                    </div>
                    <div className={styles.composerActions}>
                        <button
                            type="submit"
                            className={styles.sendBtn}
                            disabled={!input.trim() && !attachedImage}
                            aria-label={isLoading ? "Queue follow-up" : "Send message"}
                        >
                            <FaArrowRight />
                        </button>
                        {isLoading && (
                            <button
                                type="button"
                                className={styles.stopBtn}
                                onClick={handleStop}
                                aria-label="Stop generating"
                            >
                                <FaStop />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            </div>
            {/* Portfolio picker modal */}
            {portfolioPickerOpen && (
                <div className={styles.portfolioPickerOverlay} role="dialog" aria-modal="true" aria-label="Pick portfolio item">
                    <div className={styles.portfolioPickerPanel}>
                        <div className={styles.portfolioPickerHeader}>
                            <span className={styles.portfolioPickerTitle}>Portfolio Items</span>
                            <button
                                type="button"
                                className={styles.portfolioPickerClose}
                                onClick={() => setPortfolioPickerOpen(false)}
                                aria-label="Close portfolio picker"
                            >
                                <FaTimes />
                            </button>
                        </div>
                        <div className={styles.portfolioPickerSearch}>
                            <FaSearch className={styles.portfolioPickerSearchIcon} aria-hidden="true" />
                            <input
                                type="text"
                                className={styles.portfolioPickerSearchInput}
                                placeholder="Search items…"
                                value={portfolioSearch}
                                onChange={e => setPortfolioSearch(e.target.value)}
                                aria-label="Search portfolio items"
                                autoFocus
                            />
                            {portfolioSearch && (
                                <button
                                    type="button"
                                    className={styles.searchClear}
                                    onClick={() => setPortfolioSearch("")}
                                    aria-label="Clear search"
                                >
                                    <FaTimes />
                                </button>
                            )}
                        </div>
                        <div className={styles.portfolioPickerList}>
                            {portfolioItemsLoading && (
                                <div className={styles.portfolioPickerLoading}>
                                    <div className={styles.dot} />
                                    <div className={styles.dot} />
                                    <div className={styles.dot} />
                                    <span>Loading…</span>
                                </div>
                            )}
                            {!portfolioItemsLoading && filteredPortfolioItems.length === 0 && (
                                <div className={styles.portfolioPickerEmpty}>
                                    {portfolioItems.length === 0 ? "No portfolio items found." : "No items match your search."}
                                </div>
                            )}
                            {!portfolioItemsLoading && filteredPortfolioItems.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={styles.portfolioPickerItem}
                                    onClick={() => {
                                        setAttachedPortfolioItem({
                                            id: item.id,
                                            name: item.name,
                                            imageUrl: item.imageUrl,
                                            marketHashName: item.marketHashName,
                                            currentPrice: item.currentPrice,
                                        });
                                        setPortfolioPickerOpen(false);
                                    }}
                                >
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.name} className={styles.portfolioPickerItemThumb} loading="lazy" />
                                    ) : (
                                        <span className={styles.portfolioPickerItemThumbPlaceholder} aria-hidden="true">🔫</span>
                                    )}
                                    <span className={styles.portfolioPickerItemMeta}>
                                        <span className={styles.portfolioPickerItemName}>{item.name}</span>
                                        <span className={styles.portfolioPickerItemSub}>
                                            {item.exterior && <span>{item.exterior}</span>}
                                            {item.rarity && <span>{item.rarity}</span>}
                                        </span>
                                    </span>
                                    {item.currentPrice !== null && (
                                        <span className={styles.portfolioPickerItemPrice}>${item.currentPrice.toFixed(2)}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </form>
    );

    return (
        <div className={styles.container}>
            <aside className={`${styles.historyRail} ${historyExpanded ? styles.historyExpanded : styles.historyCollapsed}`} aria-label="Chat history">
                <div className={styles.historyHeader}>
                    <button
                        type="button"
                        className={styles.historyToggle}
                        onClick={() => {
                            const next = !historyExpanded;
                            setHistoryExpanded(next);
                            if (!next) {
                                setSearchOpen(false);
                                setSearchQuery("");
                            }
                        }}
                        aria-expanded={historyExpanded}
                        aria-label={historyExpanded ? "Collapse chat history" : "Expand chat history"}
                    >
                        <FaBars />
                    </button>
                    {historyExpanded && <span className={styles.historyTitle}>History</span>}
                    {historyExpanded && (
                        <button
                            type="button"
                            className={`${styles.historyToggle} ${searchOpen ? styles.historyToggleActive : ""}`}
                            onClick={() => {
                                setSearchOpen(prev => !prev);
                                setSearchQuery("");
                            }}
                            aria-label={searchOpen ? "Close search" : "Search chats"}
                            title="Search chats"
                        >
                            {searchOpen ? <FaTimes /> : <FaSearch />}
                        </button>
                    )}
                </div>
                {historyExpanded && searchOpen && (
                    <div className={styles.searchInputWrap}>
                        <FaSearch className={styles.searchIcon} aria-hidden="true" />
                        <input
                            id="aegis-chat-search"
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search chats…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            aria-label="Search chat sessions"
                            autoFocus
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className={styles.searchClear}
                                onClick={() => setSearchQuery("")}
                                aria-label="Clear search"
                            >
                                <FaTimes />
                            </button>
                        )}
                    </div>
                )}

                <button
                    type="button"
                    className={styles.newChatBtn}
                    onClick={handleNewChat}
                    disabled={isLoading}
                    aria-label="New chat"
                    title="New chat"
                >
                    <FaPlus />
                    {historyExpanded && <span>New chat</span>}
                </button>

                <AegisNotebook collapsed={!historyExpanded} />

                <div className={styles.historyList} role="list" aria-busy={sessionsLoading}>
                    {sessionsLoading && (
                        <div className={styles.historyLoadingCompact}>
                            <div className={styles.dot} aria-hidden="true"></div>
                            {historyExpanded && <span>Loading...</span>}
                        </div>
                    )}
                    {!sessionsLoading && filteredSessions.map((session) => (
                        <div
                            key={session.id}
                            className={`${styles.sessionRow} ${session.id === activeSessionId ? styles.sessionActive : ""}`}
                            role="listitem"
                        >
                            <button
                                type="button"
                                className={styles.sessionButton}
                                onClick={() => handleSwitchSession(session.id)}
                                disabled={isLoading}
                                aria-current={session.id === activeSessionId ? "page" : undefined}
                                title={session.title}
                            >
                                {historyExpanded && <FaComments className={styles.sessionIcon} />}
                                {historyExpanded && (
                                    <span className={styles.sessionCopy}>
                                        <span className={styles.sessionTitle}>{session.title}</span>
                                        <span className={styles.sessionMeta}>{session._count?.messages ?? 0} messages</span>
                                    </span>
                                )}
                            </button>
                            {historyExpanded && sessions.length > 1 && (
                                <button
                                    type="button"
                                    className={styles.sessionDelete}
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    aria-label={`Delete ${session.title}`}
                                >
                                    <FaTimes />
                                </button>
                            )}
                        </div>
                    ))}
                    {!sessionsLoading && searchQuery.trim() && filteredSessions.length === 0 && (
                        <p className={styles.searchEmpty}>No chats found</p>
                    )}
                </div>
            </aside>

            <section className={`${styles.chatPanel} ${hasStartedConversation ? "" : styles.chatPanelEmpty}`}>
                {hasStartedConversation ? (
                    <>
                        <header className={styles.chatHeader}>
                            <div>
                                <p className={styles.eyebrow}>Aegis</p>
                                <h2>{activeSession?.title ?? "New Chat"}</h2>
                            </div>
                        </header>

                        <div className={styles.messages} role="log" aria-live="polite" aria-busy={isLoading}>
                            {(historyLoading || sessionsLoading) && (
                                <div className={styles.historyLoading}>
                                    <div className={styles.dot} aria-hidden="true"></div>
                                    <div className={styles.dot} aria-hidden="true"></div>
                                    <div className={styles.dot} aria-hidden="true"></div>
                                    <span className={styles.loadingText}>Loading chat history...</span>
                                </div>
                            )}
                            {!historyLoading && !sessionsLoading && visibleMessages.map((msg) => {
                                if (msg.role === "assistant" && msg.content === "" && !hasRenderableAegisEvents(msg) && isLoading) {
                                    return null;
                                }
                                return (
                                    <div
                                        key={msg.id}
                                        className={`${styles.message} ${msg.role === "user" ? styles.messageUser : styles.messageAssistant}`}
                                    >
                                        {msg.imageBase64 && (
                                            <img src={msg.imageBase64} alt="User attachment" className={styles.chatImage} />
                                        )}
                                        {msg.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown> : null}
                                        {msg.role === "assistant" && renderAegisEvents(msg)}
                                        {msg.role === "assistant" && (msg.content || hasRenderableAegisEvents(msg)) ? renderAssistantMetadata(msg) : null}
                                    </div>
                                );
                            })}

                            {isLoading && messages[messages.length - 1]?.content === "" && !hasRenderableAegisEvents(messages[messages.length - 1]) && (
                                <output aria-live="polite" className={styles.messageLoading}>
                                    <div className={styles.dot} aria-hidden="true"></div>
                                    <div className={styles.dot} aria-hidden="true"></div>
                                    <div className={styles.dot} aria-hidden="true"></div>
                                    <span className={styles.loadingText}>Fetching market context...</span>
                                </output>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {renderComposer(false)}
                    </>
                ) : (
                    <div className={styles.emptyStage}>
                        <div className={styles.heroCopy}>
                            <h1 className={styles.aegisHeading}>Aegis</h1>
                            <p>Forecast value. Analyze volume. Optimize risk.</p>
                        </div>
                        <blockquote className={styles.tipQuote} aria-label="Aegis composer tip">
                            <span className={styles.tipLabel}>Tip:</span> {activeTip.label}
                        </blockquote>
                        {renderComposer(true)}
                    </div>
                )}
            </section>
        </div>
    );
}
