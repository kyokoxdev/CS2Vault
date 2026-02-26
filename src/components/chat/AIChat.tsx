"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import styles from "./AIChat.module.css";
import type { ChatMessageData, AIProviderName } from "@/types";
import { AI_MODELS } from "@/lib/ai/model-labels";

// Size limits
const MAX_MESSAGE_LENGTH = 4000; // characters
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

export default function AIChat() {
    const [messages, setMessages] = useState<ChatMessageData[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [provider, setProvider] = useState<AIProviderName>("gemini-pro");
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initial load history
    useEffect(() => {
        setHistoryLoading(true);
        fetch("/api/chat/history")
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data && data.data.length > 0) {
                    setMessages(data.data.map((m: { role: string; content: string }) => ({
                        role: m.role as "user" | "assistant",
                        content: m.content
                    })));
                } else {
                    // Default greeting
                    setMessages([{
                        role: "assistant",
                        content: "Hello! I am your CS2 Market Agent.\nAsk me about your portfolio, market movers, or item prices."
                    }]);
                }
            })
            .catch(() => {
                // Show friendly error instead of technical details
                setMessages([{
                    role: "assistant",
                    content: "Hello! I am your CS2 Market Agent.\nNote: Could not load chat history. You can still start a new conversation."
                }]);
            })
            .finally(() => setHistoryLoading(false));
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!input.trim() && !attachedImage) || isLoading) return;

        const userMsg: ChatMessageData = { role: "user" as const, content: input.trim() || "[Attached Image]" };
        if (attachedImage) {
            userMsg.imageBase64 = attachedImage;
        }

        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setAttachedImage(null);
        setIsLoading(true);

        // Placeholder for assistant message while streaming
        setMessages(prev => [...prev, { role: "assistant", content: "" }]);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [...messages, userMsg], provider }) // Send full context + override
            });

            if (!res.ok) throw new Error("API Error");
            if (!res.body) throw new Error("No response body");

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                setMessages(prev => {
                    const next = [...prev];
                    const lastIndex = next.length - 1;
                    const lastMsg = next[lastIndex];
                    if (lastMsg.role === "assistant") {
                        next[lastIndex] = { ...lastMsg, content: lastMsg.content + chunk };
                    }
                    return next;
                });
            }
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => {
                const next = [...prev];
                const lastIndex = next.length - 1;
                next[lastIndex] = { role: "assistant", content: "Sorry, I encountered an error while processing your request. Please check your AI provider settings and try again." };
                return next;
            });
        } finally {
            setIsLoading(false);
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
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <div className={styles.headerIcon} aria-hidden="true">🤖</div>
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
                        <span style={{ marginLeft: "8px" }}>Loading chat history...</span>
                    </div>
                )}
                {!historyLoading && messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
                    >
                        {msg.imageBase64 && (
                            <img src={msg.imageBase64} alt="User attachment" className={styles.chatImage} />
                        )}
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                ))}

                {isLoading && messages[messages.length - 1]?.content === "" && (
                    <div className={styles.messageLoading} aria-label="AI is thinking">
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                        <span style={{ marginLeft: "8px" }}>Fetching market context...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className={styles.inputArea} onSubmit={handleSubmit}>
                {attachedImage && (
                    <div className={styles.imagePreviewContainer}>
                        <img src={attachedImage} alt="Attached" className={styles.imagePreview} />
                        <button type="button" className={styles.clearImageBtn} onClick={() => setAttachedImage(null)} aria-label="Remove image">✕</button>
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
                        +
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        accept="image/*"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(file);
                            if (e.target) e.target.value = '';
                        }}
                        aria-hidden="true"
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
                    <select
                        className={styles.modelSelect}
                        value={provider}
                        onChange={(e) => setProvider(e.target.value as AIProviderName)}
                        disabled={isLoading}
                        aria-label="Select AI model"
                    >
                        {AI_MODELS.map((model) => (
                            <option key={model.value} value={model.value}>
                                {model.shortLabel}
                            </option>
                        ))}
                    </select>
                    <button
                        type="submit"
                        className={styles.sendBtn}
                        disabled={(!input.trim() && !attachedImage) || isLoading}
                        aria-label="Send message"
                    >
                        ➤
                    </button>
                </div>
            </form>
        </div>
    );
}
