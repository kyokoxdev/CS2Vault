"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { FaChevronDown, FaCheck } from "react-icons/fa";

import styles from "./TimeframeDropdown.module.css";

export interface TimeframeOption {
    label: string;
    value: string;
    description: string;
}

export interface TimeframeDropdownProps {
    value: string;
    onChange: (value: string) => void;
    options?: TimeframeOption[];
}

const DEFAULT_OPTIONS: TimeframeOption[] = [
    { label: "15M", value: "15m", description: "Short-range structure" },
    { label: "1H", value: "1h", description: "Trend over days" },
    { label: "4H", value: "4h", description: "Swing perspective" },
    { label: "1D", value: "1d", description: "Mid-term view" },
    { label: "1W", value: "1w", description: "Long-term context" },
];

export function TimeframeDropdown({ value, onChange, options = DEFAULT_OPTIONS }: TimeframeDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
    const listboxId = useId();

    const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

    const openDropdown = useCallback(() => {
        setIsOpen(true);
        setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }, [selectedIndex]);

    const closeDropdown = useCallback((returnFocus = false) => {
        setIsOpen(false);
        setFocusedIndex(-1);

        if (returnFocus) {
            requestAnimationFrame(() => {
                buttonRef.current?.focus();
            });
        }
    }, []);

    const selectOption = useCallback((index: number) => {
        const option = options[index];

        if (!option) {
            return;
        }

        onChange(option.value);
        closeDropdown(true);
    }, [closeDropdown, onChange, options]);

    const moveFocus = useCallback((direction: number) => {
        if (options.length === 0) {
            return;
        }

        setFocusedIndex((currentIndex) => {
            const startIndex = currentIndex >= 0 ? currentIndex : (selectedIndex >= 0 ? selectedIndex : 0);
            return (startIndex + direction + options.length) % options.length;
        });
    }, [options.length, selectedIndex]);

    const handleTriggerKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp":
            case "Enter":
            case " ":
                event.preventDefault();
                if (!isOpen) {
                    openDropdown();
                }
                break;
            case "Escape":
                if (isOpen) {
                    event.preventDefault();
                    closeDropdown(true);
                }
                break;
            default:
                break;
        }
    }, [closeDropdown, isOpen, openDropdown]);

    const handleListKeyDown = useCallback((event: ReactKeyboardEvent<HTMLUListElement>) => {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                moveFocus(1);
                break;
            case "ArrowUp":
                event.preventDefault();
                moveFocus(-1);
                break;
            case "Home":
                event.preventDefault();
                setFocusedIndex(0);
                break;
            case "End":
                event.preventDefault();
                setFocusedIndex(options.length - 1);
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                if (focusedIndex >= 0) {
                    selectOption(focusedIndex);
                }
                break;
            case "Escape":
                event.preventDefault();
                closeDropdown(true);
                break;
            default:
                break;
        }
    }, [closeDropdown, focusedIndex, moveFocus, options.length, selectOption]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                closeDropdown();
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [closeDropdown]);

    useEffect(() => {
        if (!isOpen || focusedIndex < 0) {
            return;
        }

        const option = optionRefs.current[focusedIndex];

        if (!option) {
            return;
        }

        const frameId = requestAnimationFrame(() => {
            option.focus();
            option.scrollIntoView({ block: "nearest" });
        });

        return () => cancelAnimationFrame(frameId);
    }, [focusedIndex, isOpen]);

    const triggerLabel = `${selectedOption?.label ?? "Select"} — ${selectedOption?.description ?? "Choose a timeframe"}`;

    return (
        <div className={styles.container} ref={containerRef}>
            <button
                type="button"
                ref={buttonRef}
                className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ""}`}
                onClick={() => {
                    if (isOpen) {
                        closeDropdown();
                        return;
                    }

                    openDropdown();
                }}
                onKeyDown={handleTriggerKeyDown}
                aria-label={`Timeframe: ${triggerLabel}`}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
            >
                <span className={styles.triggerLabel}>{selectedOption?.label ?? "Select"}</span>
                <FaChevronDown className={styles.triggerIcon} aria-hidden="true" />
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    <ul
                        id={listboxId}
                        role="listbox"
                        aria-label="Timeframe options"
                        className={styles.list}
                        onKeyDown={handleListKeyDown}
                    >
                        {options.map((option, index) => {
                            const isSelected = option.value === value;
                            const isFocused = focusedIndex === index;

                            return (
                                <li
                                    key={option.value}
                                    ref={(element) => {
                                        optionRefs.current[index] = element;
                                    }}
                                    role="option"
                                    aria-label={`${option.label} — ${option.description}`}
                                    tabIndex={-1}
                                    aria-selected={isSelected}
                                    className={`${styles.option} ${isSelected ? styles.optionSelected : ""} ${isFocused ? styles.optionFocused : ""}`}
                                    onMouseEnter={() => setFocusedIndex(index)}
                                    onClick={() => selectOption(index)}
                                >
                                    <span className={styles.optionText}>
                                        <span className={styles.optionLabel}>{option.label}</span>
                                        <span className={styles.optionDescription}>{option.description}</span>
                                    </span>
                                    {isSelected && <FaCheck className={styles.checkIcon} aria-hidden="true" />}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
