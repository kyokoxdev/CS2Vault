"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FaArrowRight, FaBars, FaChevronDown, FaComments, FaPlus, FaStop, FaTimes } from "react-icons/fa";
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
    getReasoningDepthOption,
    getReasoningDepthOptionsForModel,
    isAIAgentMode,
    isAIProviderName,
    isAIReasoningDepth,
} from "@/lib/ai/model-labels";
import { AEGIS_ITEM_SELECTED_EVENT, type AegisSelectedItem, formatItemMention } from "@/lib/ai/item-mentions";

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
const STREAM_IDLE_COMPLETION_TIMEOUT_MS = 30_000;

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
};

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

function createChatMessage(message: ChatMessageData): ChatMessage {
    return {
        ...message,
        id: crypto.randomUUID(),
    };
}

function isWelcomeMessage(message: ChatMessageData): boolean {
    return message.role === WELCOME_MESSAGE.role && message.content === WELCOME_MESSAGE.content;
}

function getNextTipIndex(currentIndex: number): number {
    return (currentIndex + 1) % AEGIS_TIPS.length;
}

export default function AIChat() {
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
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTipIndex, setActiveTipIndex] = useState(0);
    const [queuedFollowUp, setQueuedFollowUpState] = useState<ChatDraft | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const streamAbortControllerRef = useRef<AbortController | null>(null);
    const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const streamIdleTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const messagesRef = useRef<ChatMessage[]>([]);
    const activeSessionIdRef = useRef<string | null>(null);
    const queuedFollowUpRef = useRef<ChatDraft | null>(null);
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
                setMessages(data.data.map((m: { role: string; content: string }) => createChatMessage({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })));
            } else {
                setMessages([createChatMessage(WELCOME_MESSAGE)]);
            }
        } catch {
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
                setActiveSessionId(null);
                setMessages([createChatMessage(WELCOME_MESSAGE)]);
            })
            .catch(() => {
                setMessages([createChatMessage(WELCOME_MESSAGE)]);
            })
            .finally(() => setSessionsLoading(false));
    }, []);

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
        return () => {
            isMountedRef.current = false;
            clearStreamIdleTimeout();
            const activeReader = streamReaderRef.current;
            const activeController = streamAbortControllerRef.current;
            streamReaderRef.current = null;
            streamAbortControllerRef.current = null;
            activeController?.abort();
            void activeReader?.cancel().catch(() => undefined);
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
        setError(null);
        await loadHistory(sessionId);
    };

    const handleNewChat = async () => {
        if (isLoading) return;
        const newSession = await createChatSession();
        if (newSession) {
            setSessions(prev => [newSession, ...prev]);
            setActiveSessionId(newSession.id);
            setMessages([createChatMessage(WELCOME_MESSAGE)]);
            setInput("");
            setAttachedImage(null);
            setError(null);
            rotateActiveTip();
        }
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (isLoading) return;

        try {
            const res = await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) return;

            const remaining = sessions.filter(s => s.id !== sessionId);

            if (remaining.length === 0) {
                await handleNewChat();
                return;
            }

            setSessions(remaining);

            if (activeSessionId === sessionId) {
                const nextSession = remaining[0];
                setActiveSessionId(nextSession.id);
                await loadHistory(nextSession.id);
            }
        } catch {
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
        activeController?.abort();
        void activeReader?.cancel().catch(() => undefined);
        setIsLoading(false);
    };

    const submitDraft = async (draft: ChatDraft) => {
        if (!draft.content && !draft.imageBase64) return;

        const previousReader = streamReaderRef.current;
        clearStreamIdleTimeout();
        streamReaderRef.current = null;
        streamAbortControllerRef.current?.abort();
        void previousReader?.cancel().catch(() => undefined);

        const controller = new AbortController();
        streamAbortControllerRef.current = controller;

        const previousConversationMessages = messagesRef.current.filter(message => !isWelcomeMessage(message));
        const userMessagePayload: ChatMessageData = { role: "user" as const, content: draft.content || "[Attached Image]" };
        if (draft.imageBase64) {
            userMessagePayload.imageBase64 = draft.imageBase64;
        }

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
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                let errorMessage = "API Error";
                const contentType = res.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                    const data = await res.json().catch(() => null);
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
                    void activeReader.cancel().catch(() => undefined);
                    break;
                }

                const { done, value } = result;
                if (done || controller.signal.aborted) break;

                receivedAssistantChunk = true;

                const chunk = decoder.decode(value, { stream: true });
                setMessages(prev => {
                    const nextMessages = prev.map(message => {
                        if (message.id !== assistantPlaceholder.id || message.role !== "assistant") {
                            return message;
                        }

                        return { ...message, content: message.content + chunk };
                    });
                    messagesRef.current = nextMessages;
                    return nextMessages;
                });
            }

            clearStreamIdleTimeout();
            finalizeAssistantResponse();
        } catch (error) {
            clearStreamIdleTimeout();

            if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
                if (isMountedRef.current) {
                    setMessages(prev => {
                        const placeholder = prev.find(m => m.id === assistantPlaceholder.id);
                        if (placeholder && placeholder.content.trim()) {
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
                        void submitDraft(nextQueuedFollowUp).catch(() => {
                            // Safety net: submitDraft has its own try/catch/finally and
                            // should never reject, but if it does, release the lock so
                            // the UI is not permanently stuck in isLoading=true.
                            if (isMountedRef.current) setIsLoading(false);
                        });
                    } else {
                        // Aborted or no follow-up: release lock AND clear any stale
                        // queued-follow-up banner so the UI does not show an orphaned
                        // "Queued follow-up" notice after Stop is clicked.
                        setQueuedFollowUp(null);
                        setIsLoading(false);
                    }
                }
            }
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        const draft: ChatDraft = {
            content: input.trim(),
            imageBase64: attachedImage,
        };

        if (!draft.content && !draft.imageBase64) return;

        if (isLoading) {
            setQueuedFollowUp(draft);
            setInput("");
            setAttachedImage(null);
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

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        if (value.length > MAX_MESSAGE_LENGTH) {
            setError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
            return;
        }
        setError(null);
        setInput(value);
    };

    const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    const visibleMessages = messages.filter(message => !isWelcomeMessage(message));
    const hasStartedConversation = visibleMessages.length > 0;
    const activeSession = sessions.find(session => session.id === activeSessionId);
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

    const renderComposer = (centered: boolean) => (
        <form className={`${styles.inputArea} ${centered ? styles.inputAreaCentered : ""}`} onSubmit={handleSubmit}>
            {attachedImage && (
                <div className={styles.imagePreviewContainer}>
                    <img src={attachedImage} alt="Attached" className={styles.imagePreview} />
                    <button type="button" className={styles.clearImageBtn} onClick={() => setAttachedImage(null)} aria-label="Remove image"><FaTimes /></button>
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
            <div className={styles.composerShell}>
                <textarea
                    ref={inputRef}
                    data-aegis-command-target="true"
                    className={styles.input}
                    placeholder="Message Aegis..."
                    value={input}
                    onChange={handleInputChange}
                    onPaste={handlePaste}
                    onKeyDown={handleComposerKeyDown}
                    rows={centered ? 3 : 2}
                    aria-label="Chat message input"
                />
                <div className={styles.composerToolbar}>
                    <div className={styles.toolbarAttach}>
                        <button
                            type="button"
                            className={styles.attachBtn}
                            onClick={() => fileInputRef.current?.click()}
                            title="Upload image (or Ctrl+V)"
                            aria-label="Attach image"
                        >
                            <FaPlus />
                        </button>
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
        </form>
    );

    return (
        <div className={styles.container}>
            <aside className={`${styles.historyRail} ${historyExpanded ? styles.historyExpanded : styles.historyCollapsed}`} aria-label="Chat history">
                <div className={styles.historyHeader}>
                    <button
                        type="button"
                        className={styles.historyToggle}
                        onClick={() => setHistoryExpanded(prev => !prev)}
                        aria-expanded={historyExpanded}
                        aria-label={historyExpanded ? "Collapse chat history" : "Expand chat history"}
                    >
                        <FaBars />
                    </button>
                    {historyExpanded && <span className={styles.historyTitle}>History</span>}
                </div>

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

                <div className={styles.historyList} role="list" aria-busy={sessionsLoading}>
                    {sessionsLoading && (
                        <div className={styles.historyLoadingCompact}>
                            <div className={styles.dot} aria-hidden="true"></div>
                            {historyExpanded && <span>Loading...</span>}
                        </div>
                    )}
                    {!sessionsLoading && sessions.map((session) => (
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
                                <FaComments className={styles.sessionIcon} />
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
                                if (msg.role === "assistant" && msg.content === "" && isLoading) {
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
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                        {msg.role === "assistant" && renderAssistantMetadata(msg)}
                                    </div>
                                );
                            })}

                            {isLoading && messages[messages.length - 1]?.content === "" && (
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
