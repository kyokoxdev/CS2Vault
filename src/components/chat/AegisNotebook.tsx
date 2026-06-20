"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FaArchive, FaBook, FaEdit, FaPlus, FaSave, FaTimes } from "react-icons/fa";
import styles from "./AIChat.module.css";

interface AegisNotebookMemory {
    id: string;
    title: string;
    content: string;
    kind?: string | null;
    tags?: string[] | null;
    source?: string | null;
    confidence?: number | null;
    archivedAt?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
}

interface NotebookResponse {
    success?: boolean;
    data?: AegisNotebookMemory[];
    error?: string;
}

interface NotebookItemResponse {
    success?: boolean;
    data?: AegisNotebookMemory;
    error?: string;
}

interface DraftMemory {
    title: string;
    content: string;
    kind: string;
    tags: string;
}

const emptyDraft: DraftMemory = {
    title: "",
    content: "",
    kind: "preference",
    tags: "",
};

function formatTimestamp(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function toTagList(value: string): string[] {
    return value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
}

interface AegisNotebookProps {
    collapsed?: boolean;
}

export function AegisNotebook({ collapsed = false }: AegisNotebookProps) {
    const [memories, setMemories] = useState<AegisNotebookMemory[]>([]);
    const [includeArchived, setIncludeArchived] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [draft, setDraft] = useState<DraftMemory>(emptyDraft);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [archivingId, setArchivingId] = useState<string | null>(null);

    const loadMemories = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const query = includeArchived ? "?includeArchived=true" : "";
            const res = await fetch(`/api/aegis/notebook${query}`, { cache: "no-store" });
            const data = await res.json().catch(() => null) as NotebookResponse | null;

            if (!res.ok || !data?.success || !Array.isArray(data.data)) {
                throw new Error(data?.error || "Failed to load Aegis notebook.");
            }

            setMemories(data.data);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load Aegis notebook.");
        } finally {
            setIsLoading(false);
        }
    }, [includeArchived]);

    useEffect(() => {
        void loadMemories();
    }, [loadMemories]);

    const visibleCount = useMemo(
        () => memories.filter((memory) => includeArchived || !memory.archivedAt).length,
        [includeArchived, memories],
    );

    const resetComposer = () => {
        setDraft(emptyDraft);
        setCreateOpen(false);
        setEditingId(null);
    };

    const startEdit = (memory: AegisNotebookMemory) => {
        setFeedback(null);
        setError(null);
        setEditingId(memory.id);
        setCreateOpen(true);
        setDraft({
            title: memory.title,
            content: memory.content,
            kind: memory.kind || "preference",
            tags: memory.tags?.join(", ") || "",
        });
    };

    const submitDraft = async () => {
        if (!draft.title.trim() || !draft.content.trim()) {
            setError("Title and content are required.");
            return;
        }

        setSaving(true);
        setError(null);
        setFeedback(null);

        try {
            const payload = {
                title: draft.title.trim(),
                content: draft.content.trim(),
                kind: draft.kind.trim() || undefined,
                tags: toTagList(draft.tags),
            };

            const endpoint = editingId ? `/api/aegis/notebook/${encodeURIComponent(editingId)}` : "/api/aegis/notebook";
            const method = editingId ? "PATCH" : "POST";

            const res = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => null) as NotebookItemResponse | null;

            if (!res.ok || !data?.success || !data.data) {
                throw new Error(data?.error || "Failed to save Aegis notebook memory.");
            }

            setFeedback(editingId ? "Memory updated." : "Memory added to notebook.");
            resetComposer();
            await loadMemories();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Failed to save Aegis notebook memory.");
        } finally {
            setSaving(false);
        }
    };

    const archiveMemory = async (memoryId: string) => {
        setArchivingId(memoryId);
        setError(null);
        setFeedback(null);

        try {
            const res = await fetch(`/api/aegis/notebook/${encodeURIComponent(memoryId)}`, {
                method: "DELETE",
            });
            const data = await res.json().catch(() => null) as NotebookItemResponse | null;

            if (!res.ok || !data?.success) {
                throw new Error(data?.error || "Failed to archive notebook memory.");
            }

            setFeedback("Memory archived.");
            await loadMemories();
        } catch (archiveError) {
            setError(archiveError instanceof Error ? archiveError.message : "Failed to archive notebook memory.");
        } finally {
            setArchivingId(null);
        }
    };

    if (collapsed) {
        return (
            <section className={styles.notebookShell} aria-label="Aegis notebook collapsed">
                <button
                    type="button"
                    className={styles.notebookCollapsedButton}
                    aria-label="Expand Aegis notebook by opening chat history rail"
                    disabled
                >
                    <FaBook aria-hidden="true" />
                </button>
            </section>
        );
    }

    return (
        <section className={styles.notebookShell} aria-label="Aegis notebook">
            <div className={styles.notebookHeader}>
                <div>
                    <p className={styles.notebookEyebrow}>Aegis&apos;s Notebook</p>
                    <h3 className={styles.notebookTitle}>Persistent memories</h3>
                </div>
                <button
                    type="button"
                    className={styles.notebookActionButton}
                    onClick={() => {
                        setCreateOpen((current) => !current);
                        setEditingId(null);
                        setDraft(emptyDraft);
                        setFeedback(null);
                        setError(null);
                    }}
                    aria-label={createOpen ? "Close notebook editor" : "Create notebook memory"}
                >
                    {createOpen ? <FaTimes aria-hidden="true" /> : <FaPlus aria-hidden="true" />}
                </button>
            </div>

            <div className={styles.notebookToolbar}>
                <span className={styles.notebookCount}>{visibleCount} memories</span>
                <button
                    type="button"
                    className={styles.notebookSecondaryButton}
                    onClick={() => setIncludeArchived((current) => !current)}
                    aria-label={includeArchived ? "Hide archived notebook memories" : "Show archived notebook memories"}
                >
                    {includeArchived ? "Hide archived" : "Show archived"}
                </button>
            </div>

            {createOpen ? (
                <div className={styles.notebookEditor}>
                    <label className={styles.notebookLabel}>
                        <span>Title</span>
                        <input
                            className={styles.notebookInput}
                            value={draft.title}
                            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                            placeholder="What should Aegis remember?"
                        />
                    </label>
                    <label className={styles.notebookLabel}>
                        <span>Kind</span>
                        <input
                            className={styles.notebookInput}
                            value={draft.kind}
                            onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}
                            placeholder="preference"
                        />
                    </label>
                    <label className={styles.notebookLabel}>
                        <span>Tags</span>
                        <input
                            className={styles.notebookInput}
                            value={draft.tags}
                            onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
                            placeholder="watchlist, trading"
                        />
                    </label>
                    <label className={styles.notebookLabel}>
                        <span>Memory</span>
                        <textarea
                            className={styles.notebookTextarea}
                            value={draft.content}
                            onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                            rows={4}
                            placeholder="Aegis will use this note during future conversations."
                        />
                    </label>
                    <div className={styles.notebookEditorActions}>
                        <button
                            type="button"
                            className={styles.notebookSecondaryButton}
                            onClick={resetComposer}
                            aria-label="Cancel notebook editing"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className={styles.notebookPrimaryButton}
                            onClick={() => void submitDraft()}
                            disabled={saving}
                            aria-label={editingId ? "Save notebook memory" : "Create notebook memory"}
                        >
                            <FaSave aria-hidden="true" />
                            <span>{saving ? "Saving..." : editingId ? "Save" : "Create"}</span>
                        </button>
                    </div>
                </div>
            ) : null}

            {feedback ? <p className={styles.notebookFeedback}>{feedback}</p> : null}
            {error ? <p className={styles.notebookError}>{error}</p> : null}

            <div className={styles.notebookList}>
                {isLoading ? <p className={styles.notebookStatus}>Loading notebook...</p> : null}
                {!isLoading && memories.length === 0 ? <p className={styles.notebookStatus}>No memories saved yet.</p> : null}
                {!isLoading && memories.map((memory) => {
                    const isArchived = Boolean(memory.archivedAt);
                    return (
                        <article key={memory.id} className={`${styles.notebookCard} ${isArchived ? styles.notebookCardArchived : ""}`}>
                            <div className={styles.notebookCardHeader}>
                                <div>
                                    <h4 className={styles.notebookCardTitle}>{memory.title || "Untitled memory"}</h4>
                                    <p className={styles.notebookCardMeta}>
                                        {[memory.kind, formatTimestamp(memory.updatedAt) || formatTimestamp(memory.createdAt)]
                                            .filter((value): value is string => Boolean(value))
                                            .join(" • ")}
                                    </p>
                                </div>
                                {!isArchived ? (
                                    <div className={styles.notebookCardActions}>
                                        <button
                                            type="button"
                                            className={styles.notebookIconButton}
                                            onClick={() => startEdit(memory)}
                                            aria-label={`Edit notebook memory ${memory.title || "untitled"}`}
                                        >
                                            <FaEdit aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.notebookIconButton}
                                            onClick={() => void archiveMemory(memory.id)}
                                            disabled={archivingId === memory.id}
                                            aria-label={`Archive notebook memory ${memory.title || "untitled"}`}
                                        >
                                            <FaArchive aria-hidden="true" />
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                            <p className={styles.notebookCardContent}>{memory.content || "No content."}</p>
                            {memory.tags && memory.tags.length > 0 ? (
                                <div className={styles.notebookTagRow}>
                                    {memory.tags.map((tag) => (
                                        <span key={`${memory.id}-${tag}`} className={styles.notebookTag}>{tag}</span>
                                    ))}
                                </div>
                            ) : null}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
