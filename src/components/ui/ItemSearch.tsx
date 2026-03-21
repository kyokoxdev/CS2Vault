"use client";

/**
 * Item Search Autocomplete
 *
 * Type-ahead search for CS2 items via Steam Market.
 * Debounced API calls, keyboard navigation, click to select.
 * Dropdown renders ABOVE the input to avoid being clipped by overflow.
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface SearchResult {
    hashName: string;
    name: string;
    imageUrl: string | null;
    price: string | null;
    listings: number;
    category: string;
    type: string | null;
    rarity: string | null;
    exterior: string | null;
    steamType: string | null;
}

interface ItemSearchProps {
    onSelect: (item: { hashName: string; name: string; category: string; rarity: string | null; exterior: string | null; type: string | null }) => void;
    placeholder?: string;
}

export default function ItemSearch({
    onSelect,
    placeholder = "Search CS2 items...",
}: ItemSearchProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const search = useCallback(async (q: string) => {
        if (q.length < 2) {
            setResults([]);
            setShowDropdown(false);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            if (data.success) {
                setResults(data.data.results);
                setShowDropdown(data.data.results.length > 0);
                setActiveIndex(-1);
            }
        } catch (err) {
            console.error("Search error:", err);
        }
        setLoading(false);
    }, []);

    function handleInputChange(value: string) {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(value), 300);
    }

    function handleSelect(item: SearchResult) {
        // Parse a display name from the hash name
        // e.g. "AK-47 | Redline (Field-Tested)" -> "AK-47 Redline"
        const parts = item.hashName.split(" | ");
        const weapon = parts[0];
        const skinPart = parts[1]?.replace(/\s*\(.*\)/, "") ?? "";
        const displayName = skinPart ? `${weapon} ${skinPart}` : weapon;

        onSelect({ hashName: item.hashName, name: displayName, category: item.category, rarity: item.rarity, exterior: item.exterior, type: item.type });
        setQuery("");
        setResults([]);
        setShowDropdown(false);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (!showDropdown) return;

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setActiveIndex((prev) => Math.max(prev - 1, -1));
                break;
            case "Enter":
                e.preventDefault();
                if (activeIndex >= 0 && results[activeIndex]) {
                    handleSelect(results[activeIndex]);
                }
                break;
            case "Escape":
                setShowDropdown(false);
                setActiveIndex(-1);
                break;
        }
    }

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Clear debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0 && dropdownRef.current) {
            const items = dropdownRef.current.querySelectorAll("[data-search-item]");
            items[activeIndex]?.scrollIntoView({ block: "nearest" });
        }
    }, [activeIndex]);

    const categoryLabel = (cat: string) => {
        const labels: Record<string, string> = {
            weapon: "[W]",
            knife: "[K]",
            glove: "[G]",
            container: "[C]",
            key: "[KY]",
            sticker: "[S]",
            agent: "[A]",
            graffiti: "[GR]",
            music_kit: "[M]",
            patch: "[P]",
            collectible: "[CO]",
            tool: "[T]",
        };
        return labels[cat] ?? "[?]";
    };

    return (
        <div style={{ position: "relative", width: "100%" }}>
            <div style={{ position: "relative" }}>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => results.length > 0 && setShowDropdown(true)}
                    placeholder={placeholder}
                    style={{
                        width: "100%",
                        padding: "10px 14px",
                        paddingRight: loading ? 36 : 14,
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-primary)",
                        fontSize: 14,
                        outline: "none",
                        transition: "border-color var(--transition-fast)",
                    }}
                />
                {loading && (
                    <div
                        style={{
                            position: "absolute",
                            right: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: 16,
                            height: 16,
                            border: "2px solid var(--border)",
                            borderTopColor: "var(--accent-primary)",
                            borderRadius: "50%",
                            animation: "spin 0.6s linear infinite",
                        }}
                    />
                )}
            </div>

            {/* Dropdown — renders BELOW input, uses fixed positioning to escape overflow */}
            {showDropdown && (
                <div
                    ref={dropdownRef}
                    style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        maxHeight: 400,
                        overflowY: "auto",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "0 12px 48px rgba(0, 0, 0, 0.6)",
                        zIndex: 9999,
                    }}
                >
                    {results.map((item, i) => (
                        <button
                            key={item.hashName}
                            type="button"
                            data-search-item
                            onClick={() => handleSelect(item)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "10px 14px",
                                cursor: "pointer",
                                background:
                                    i === activeIndex ? "var(--bg-hover)" : "transparent",
                                borderTop: "none",
                                borderLeft: "none",
                                borderRight: "none",
                                borderBottom:
                                    i < results.length - 1
                                        ? "1px solid var(--border)"
                                        : "none",
                                transition: "background var(--transition-fast)",
                                width: "100%",
                                textAlign: "left",
                                fontFamily: "inherit",
                                color: "inherit",
                            }}
                            onMouseEnter={() => setActiveIndex(i)}
                        >
                            {/* Item image */}
                            {item.imageUrl ? (
                                <img
                                    src={item.imageUrl}
                                    alt=""
                                    style={{
                                        width: 48,
                                        height: 36,
                                        objectFit: "contain",
                                        borderRadius: 4,
                                        background: "var(--bg-tertiary)",
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: 48,
                                        height: 36,
                                        background: "var(--bg-tertiary)",
                                        borderRadius: 4,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 18,
                                    }}
                                >
                                    {categoryLabel(item.category)}
                                </div>
                            )}

                            {/* Item info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 500,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {item.name}
                                </div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        color: "var(--text-muted)",
                                        display: "flex",
                                        gap: 6,
                                        alignItems: "center",
                                    }}
                                >
                                    <span style={{
                                        background: "var(--bg-tertiary)",
                                        padding: "1px 6px",
                                        borderRadius: 3,
                                        fontSize: 10,
                                        textTransform: "capitalize",
                                    }}>
                                        {item.category.replace("_", " ")}
                                    </span>
                                    {item.steamType && (
                                        <span style={{
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}>
                                            {item.steamType}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Price */}
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                                {item.price && (
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 600,
                                            fontFamily: "var(--font-mono)",
                                            color: "var(--green)",
                                        }}
                                    >
                                        {item.price}
                                    </div>
                                )}
                                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                    {item.listings.toLocaleString()} listings
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <style>{`
                @keyframes spin {
                    to { transform: translateY(-50%) rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
