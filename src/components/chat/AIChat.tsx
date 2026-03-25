"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { FaRobot, FaTimes, FaPlus, FaArrowRight } from "react-icons/fa";
import styles from "./AIChat.module.css";
import type { ChatMessageData, AIProviderName } from "@/types";
import { AI_MODELS } from "@/lib/ai/model-labels";
import { Select } from "@/components/ui/Select";

// Size limits
const MAX_MESSAGE_LENGTH = 4000; // characters
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

type ChatMessage = ChatMessageData & {
    id: string;
};

function createChatMessage(message: ChatMessageData): ChatMessage {
    return {
        ...message,
        id: crypto.randomUUID(),
    };
}

export default function AIChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [provider, setProvider] = useState<AIProviderName>("gemini-pro");
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const streamAbortControllerRef = useRef<AbortController | null>(null);
    const isMountedRef = useRef(true);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initial load history
    useEffect(() => {
        setHistoryLoading(true);
        fetch("/api/chat/history")
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data && data.data.length > 0) {
                    setMessages(data.data.map((m: { role: string; content: string }) => createChatMessage({
                        role: m.role as "user" | "assistant",
                        content: m.content
                    })));
                } else {
                    // Default greeting
                    setMessages([createChatMessage({
                        role: "assistant",
                        content: "Hello! I am your CS2 Market Agent.\nAsk me about your portfolio, market movers, or item prices."
                    })]);
                }
            })
            .catch(() => {
                // Show friendly error instead of technical details
                setMessages([createChatMessage({
                    role: "assistant",
                    content: "Hello! I am your CS2 Market Agent.\nNote: Could not load chat history. You can still start a new conversation."
                })]);
            })
            .finally(() => setHistoryLoading(false));
    }, []);

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

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [...messages, userMessagePayload].map(({ role, content, imageBase64 }) => ({ role, content, imageBase64 })),
                    provider,
                }), // Send full context + override
                signal: controller.signal,
            });

            if (!res.ok) throw new Error("API Error");
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
                    setMessages(prev => prev.filter(message => message.id !== assistantPlaceholder.id));
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

            <div className={styles.messages} role="log" aria-live="polite">
                {historyLoading && (
                    <div className={styles.historyLoading}>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                        <span className={styles.loadingText}>Loading chat history...</span>
                    </div>
                )}
                {!historyLoading && messages.map((msg) => (
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
                    <output className={styles.messageLoading}>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
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
                    <button
                        type="submit"
                        className={styles.sendBtn}
                        disabled={(!input.trim() && !attachedImage) || isLoading}
                        aria-label="Send message"
                    >
                        <FaArrowRight />
                    </button>
                </div>
            </form>
        </div>
    );
}
