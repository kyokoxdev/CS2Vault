"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FaSearch } from "react-icons/fa";
import styles from "./CommandPalette.module.css";

interface SearchResult {
  id?: string | null;
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

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: {
    id?: string | null;
    hashName: string;
    name: string;
    imageUrl: string | null;
    category: string;
    rarity: string | null;
    exterior: string | null;
    type: string | null;
  }) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
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

export default function CommandPalette({
  isOpen,
  onClose,
  onSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchIdRef = useRef(0);

  const resetSearchState = useCallback((invalidateInFlight = false) => {
    if (invalidateInFlight) {
      searchIdRef.current += 1;
    }
    setLoading(false);
    setResults([]);
    setActiveIndex(-1);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      resetSearchState(true);
      return;
    }

    const id = ++searchIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (id === searchIdRef.current && data.success) {
        setResults(data.data.results);
        setActiveIndex(data.data.results.length > 0 ? 0 : -1);
      }
    } catch {
      if (id === searchIdRef.current) {
        setResults([]);
        setActiveIndex(-1);
      }
    }
    if (id === searchIdRef.current) {
      setLoading(false);
    }
  }, [resetSearchState]);

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      resetSearchState(true);
      return;
    }

    debounceRef.current = setTimeout(() => search(value), 300);
  }

  function handleSelect(item: SearchResult) {
    const parts = item.hashName.split(" | ");
    const weapon = parts[0];
    const skinPart = parts[1]?.replace(/\s*\(.*\)/, "") ?? "";
    const displayName = skinPart ? `${weapon} ${skinPart}` : weapon;

    onSelect({
      id: item.id ?? null,
      hashName: item.hashName,
      name: displayName,
      imageUrl: item.imageUrl,
      category: item.category,
      rarity: item.rarity,
      exterior: item.exterior,
      type: item.type,
    });
    setQuery("");
    resetSearchState(true);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(results.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
          handleSelect(results[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      resetSearchState(true);
    }
  }, [isOpen, resetSearchState]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeIndex >= 0) {
      const items = document.querySelectorAll("[data-command-result]");
      const el = items[activeIndex];
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  function handleOverlayMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function categoryLabel(cat: string): string {
    return CATEGORY_LABELS[cat] ?? "[?]";
  }

  if (!isOpen) return null;

  return (
    <div
      data-testid="item-command-palette"
      className={styles.overlay}
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        className={styles.palette}
        data-testid="command-palette"
        role="dialog"
        aria-label="Search items"
        aria-modal="true"
      >
        <div className={styles.inputSection}>
          <FaSearch className={styles.inputIcon} />
          <input
            ref={inputRef}
            data-testid="item-command-input"
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search CS2 items..."
            className={styles.input}
            role="combobox"
            aria-label="Search CS2 items"
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
            aria-controls="command-palette-listbox"
            aria-activedescendant={
              activeIndex >= 0 ? `command-result-${activeIndex}` : undefined
            }
          />
          <kbd className={styles.kbdHint}>esc</kbd>
        </div>

        <div
          id="command-palette-listbox"
          className={styles.results}
          role="listbox"
          aria-label="Search results"
        >
          {loading && results.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className={styles.emptyState}>
              No items found for &ldquo;{query}&rdquo;
            </div>
          )}

          {query.length < 2 && !loading && (
            <div className={styles.emptyState}>
              Type at least 2 characters to search
            </div>
          )}

          {results.map((item, i) => {
            return (
              <button
                key={item.hashName}
                id={`command-result-${i}`}
                type="button"
                data-testid="item-command-result"
                data-command-result
                data-active={i === activeIndex}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => handleSelect(item)}
                className={`${styles.resultItem}${
                  i === activeIndex ? ` ${styles.active}` : ""
                }`}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {item.imageUrl ? (
                  <div
                    role="img"
                    aria-label={item.name}
                    className={styles.itemImage}
                    style={{ backgroundImage: `url(${item.imageUrl})` }}
                  />
                ) : (
                  <div className={styles.itemImagePlaceholder}>
                    {categoryLabel(item.category)}
                  </div>
                )}

                <div className={styles.itemInfo}>
                  <div className={styles.itemName}>{item.name}</div>
                  <div className={styles.itemMeta}>
                    <span className={styles.metaTag}>
                      {item.category.replace("_", " ")}
                    </span>
                    {item.type && (
                      <span className={styles.metaTag}>{item.type}</span>
                    )}
                    {item.rarity && <span className={styles.metaTag}>{item.rarity}</span>}
                    {item.exterior && (
                      <span className={styles.metaTag}>{item.exterior}</span>
                    )}
                  </div>
                </div>

                <div className={styles.priceBlock}>
                  {item.price && (
                    <div className={styles.price}>{item.price}</div>
                  )}
                  <div className={styles.listings}>
                    {item.listings.toLocaleString()} listings
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export type { CommandPaletteProps };
export { CATEGORY_LABELS };
