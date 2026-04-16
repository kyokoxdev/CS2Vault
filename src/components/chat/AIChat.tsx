"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { FaRobot, FaTimes, FaPlus, FaArrowRight, FaStop } from "react-icons/fa";
import styles from "./AIChat.module.css";
import type { ChatMessageData, AIProviderName } from "@/types";
import { AI_MODELS } from "@/lib/ai/model-labels";
import { Select } from "@/components/ui/Select";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_CONTEXT_MESSAGES = 30;

const WELCOME_MESSAGE: ChatMessageData = {
    role: "assistant",
    content: "Hello! I am your CS2 Market Agent.\nAsk me about your portfolio, market movers, or item prices.",
};

type ChatMessage = ChatMessageData & {
    id: string;
};

interface ChatSessionData {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    _count?: { messages: number };
}

function createChatMessage(message: ChatMessageData): ChatMessage {
    return {
        ...message,
        id: crypto.randomUUID(),
    };
}

export default function AIChat() {
    const [sessions, setSessions] = useState<ChatSessionData[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [sessionsLoading, setSessionsLoading] = useState(true);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [provider, setProvider] = useState<AIProviderName>("gemini-pro");
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const streamAbortControllerRef = useRef<AbortController | null>(null);
    const isMountedRef = useRef(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const tabsContainerRef = useRef<HTMLDivElement>(null);

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
                content: "Hello! I am your CS2 Market Agent.\nNote: Could not load chat history. You can still start a new conversation.",
            })]);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        setSessionsLoading(true);
        fetch("/api/chat/sessions")
            .then(res => res.json())
            .then(async (data) => {
                if (data.success && data.data && data.data.length > 0) {
                    setSessions(data.data);
                    const firstSession = data.data[0];
                    setActiveSessionId(firstSession.id);
                    await loadHistory(firstSession.id);
                } else {
                    try {
                        const createRes = await fetch("/api/chat/sessions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title: "New Chat" }),
                        });
                        const createData = await createRes.json();
                        if (createData.success) {
                            setSessions([createData.data]);
                            setActiveSessionId(createData.data.id);
                        }
                    } catch {
                        // Session creation failed — chat works without persistence
                    }
                    setMessages([createChatMessage(WELCOME_MESSAGE)]);
                }
            })
            .catch(() => {
                setMessages([createChatMessage(WELCOME_MESSAGE)]);
            })
            .finally(() => setSessionsLoading(false));
    }, [loadHistory]);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            streamAbortControllerRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

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
        try {
            const res = await fetch("/api/chat/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "New Chat" }),
            });
            const data = await res.json();
            if (data.success) {
                setSessions(prev => [data.data, ...prev]);
                setActiveSessionId(data.data.id);
                setMessages([createChatMessage(WELCOME_MESSAGE)]);
                setInput("");
                setAttachedImage(null);
                setError(null);
                requestAnimationFrame(() => {
                    tabsContainerRef.current?.scrollTo({ left: 0, behavior: "smooth" });
                });
            }
        } catch {
            setError("Failed to create new chat session.");
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
        streamAbortControllerRef.current?.abort();
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!input.trim() && !attachedImage) || isLoading) return;

        streamAbortControllerRef.current?.abort();
        const controller = new AbortController();
        streamAbortControllerRef.current = controller;

        const userMessagePayload: ChatMessageData = { role: "user" as const, content: input.trim() || "[Attached Image]" };
        if (attachedImage) {
            userMessagePayload.imageBase64 = attachedImage;
        }

        const userMsg = createChatMessage(userMessagePayload);
        const assistantPlaceholder = createChatMessage({ role: "assistant", content: "" });

        setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
        setInput("");
        setAttachedImage(null);
        setIsLoading(true);

        const isFirstMessage = messages.length <= 1 && messages[0]?.role === "assistant";
        if (isFirstMessage) {
            const newTitle = userMessagePayload.content.slice(0, 80) || "New Chat";
            setSessions(prev => prev.map(s =>
                s.id === activeSessionId ? { ...s, title: newTitle } : s
            ));
        }

        try {
            const contextMessages = [...messages, userMessagePayload]
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
                    provider,
                    ...(activeSessionId ? { sessionId: activeSessionId } : {}),
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || "API Error");
            }
            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (!controller.signal.aborted) {
                const { done, value } = await reader.read();
                if (done || controller.signal.aborted) break;

                const chunk = decoder.decode(value, { stream: true });
                setMessages(prev => {
                    return prev.map(message => {
                        if (message.id !== assistantPlaceholder.id || message.role !== "assistant") {
                            return message;
                        }

                        return { ...message, content: message.content + chunk };
                    });
                });
            }
        } catch (error) {
            if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
                if (isMountedRef.current) {
                    setMessages(prev => {
                        const placeholder = prev.find(m => m.id === assistantPlaceholder.id);
                        if (placeholder && placeholder.content.trim()) {
                            return prev;
                        }
                        return prev.filter(message => message.id !== assistantPlaceholder.id);
                    });
                }
                return;
            }

            console.error("Chat error:", error);
            setMessages(prev => prev.map(message => {
                if (message.id !== assistantPlaceholder.id) {
                    return message;
                }

                return {
                    ...message,
                    content: "Sorry, I encountered an error while processing your request. Please check your AI provider settings and try again.",
                };
            }));
        } finally {
            if (streamAbortControllerRef.current === controller) {
                streamAbortControllerRef.current = null;

                if (isMountedRef.current) {
                    setIsLoading(false);
                }
            }
        }
    };

    const handleImageUpload = (file: File) => {
        if (!file.type.startsWith('image/')) {
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
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) handleImageUpload(file);
                e.preventDefault();
                break;
            }
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value.length > MAX_MESSAGE_LENGTH) {
            setError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
            return;
        }
        setError(null);
        setInput(value);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <div className={styles.headerIcon} aria-hidden="true"><FaRobot /></div>
                    <div>
                        <div className={styles.headerTitle}>CS2Vault AI Agent</div>
                        <div className={styles.headerSub}>Powered by Gemini & OpenAI Fast Fallback</div>
                    </div>
                </div>
            </div>

            <div className={styles.tabBar} role="tablist" aria-label="Chat sessions">
                <div className={styles.tabsScroll} ref={tabsContainerRef}>
                    {!sessionsLoading && sessions.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            role="tab"
                            aria-selected={s.id === activeSessionId}
                            className={`${styles.tab} ${s.id === activeSessionId ? styles.tabActive : ""}`}
                            onClick={() => handleSwitchSession(s.id)}
                            title={s.title}
                        >
                            <span className={styles.tabTitle}>{s.title}</span>
                            {sessions.length > 1 && (
                                <button
                                    type="button"
                                    className={styles.tabClose}
                                    onClick={(e) => handleDeleteSession(e, s.id)}
                                    aria-label={`Delete ${s.title}`}
                                >
                                    <FaTimes />
                                </button>
                            )}
                        </button>
                    ))}
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
                </button>
            </div>

            <div className={styles.messages} role="log" aria-live="polite" aria-busy={isLoading}>
                {(historyLoading || sessionsLoading) && (
                    <div className={styles.historyLoading}>
                        <div className={styles.dot} aria-hidden="true"></div>
                        <div className={styles.dot} aria-hidden="true"></div>
                        <div className={styles.dot} aria-hidden="true"></div>
                        <span className={styles.loadingText}>Loading chat history...</span>
                    </div>
                )}
                {!historyLoading && !sessionsLoading && messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
                    >
                        {msg.imageBase64 && (
                            <img src={msg.imageBase64} alt="User attachment" className={styles.chatImage} />
                        )}
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                ))}

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

            <form className={styles.inputArea} onSubmit={handleSubmit}>
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
                <div className={styles.inputWrapper}>
                    <button
                        type="button"
                        className={styles.attachBtn}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
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
                            if (e.target) e.target.value = '';
                        }}
                    />
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="Ask about your portfolio, paste an image (Ctrl+V)..."
                        value={input}
                        onChange={handleInputChange}
                        onPaste={handlePaste}
                        disabled={isLoading}
                        aria-label="Chat message input"
                    />
                    <Select
                        className={styles.modelSelect}
                        value={provider}
                        onChange={(val) => setProvider(val as AIProviderName)}
                        disabled={isLoading}
                        options={AI_MODELS.map(model => ({ label: model.shortLabel, value: model.value }))}
                        menuPlacement="top"
                    />
                    {isLoading ? (
                        <button
                            type="button"
                            className={styles.stopBtn}
                            onClick={handleStop}
                            aria-label="Stop generating"
                        >
                            <FaStop />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className={styles.sendBtn}
                            disabled={!input.trim() && !attachedImage}
                            aria-label="Send message"
                        >
                            <FaArrowRight />
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
