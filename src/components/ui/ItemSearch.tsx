"use client";

/**
 * Item Search Autocomplete
 *
 * Type-ahead search for CS2 items via Steam Market.
 * Debounced API calls, keyboard navigation, click to select.
 * Dropdown renders ABOVE the input to avoid being clipped by overflow.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./ItemSearch.module.css";

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
    onSelect: (item: { hashName: string; name: string; imageUrl: string | null; category: string; rarity: string | null; exterior: string | null; type: string | null }) => void;
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

        onSelect({ hashName: item.hashName, name: displayName, imageUrl: item.imageUrl, category: item.category, rarity: item.rarity, exterior: item.exterior, type: item.type });
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
        <div className={styles.wrapper}>
            <div className={styles.inputWrapper}>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => results.length > 0 && setShowDropdown(true)}
                    placeholder={placeholder}
                    className={`${styles.input}${loading ? ` ${styles.inputLoading}` : ""}`}
                    role="combobox"
                    aria-label="Search CS2 items"
                    aria-expanded={showDropdown}
                    aria-autocomplete="list"
                    aria-controls="search-results-listbox"
                    aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
                />
                {loading && (
                    <div className={styles.spinner} />
                )}
            </div>

            {/* Dropdown — renders BELOW input, uses fixed positioning to escape overflow */}
            {showDropdown && (
                <div
                    ref={dropdownRef}
                    className={styles.dropdown}
                    role="listbox"
                    id="search-results-listbox"
                    aria-label="Search CS2 items results"
                >
                    {results.map((item, i) => (
                        <button
                            key={item.hashName}
                            id={`search-result-${i}`}
                            type="button"
                            data-search-item
                            role="option"
                            aria-selected={i === activeIndex}
                            onClick={() => handleSelect(item)}
                            className={`${styles.resultItem}${i === activeIndex ? ` ${styles.active}` : ""}`}
                            onMouseEnter={() => setActiveIndex(i)}
                        >
                            {/* Item image */}
                            {item.imageUrl ? (
                                <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    loading="lazy"
                                    className={styles.itemImage}
                                />
                            ) : (
                                <div className={styles.itemImagePlaceholder}>
                                    {categoryLabel(item.category)}
                                </div>
                            )}

                            {/* Item info */}
                            <div className={styles.itemInfo}>
                                <div className={styles.itemName}>
                                    {item.name}
                                </div>
                                <div className={styles.itemMeta}>
                                    <span className={styles.categoryBadge}>
                                        {item.category.replace("_", " ")}
                                    </span>
                                    {item.steamType && (
                                        <span className={styles.steamType}>
                                            {item.steamType}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Price */}
                            <div className={styles.priceBlock}>
                                {item.price && (
                                    <div className={styles.price}>
                                        {item.price}
                                    </div>
                                )}
                                <div className={styles.listings}>
                                    {item.listings.toLocaleString()} listings
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
