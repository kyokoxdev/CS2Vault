"use client";

import { useState, useRef, useEffect, useId, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { FaChevronDown, FaCheck } from "react-icons/fa";
import styles from "./Select.module.css";

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  menuPlacement?: "bottom" | "top"; // Optional placement prop
  disabled?: boolean;
}

export function Select({ value, onChange, options, placeholder = "Select...", className = "", menuPlacement = "bottom", disabled = false }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const listboxId = useId();

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption = options.find((opt) => opt.value === value);
  const listboxLabel = placeholder !== "Select..." ? placeholder : "Select an option";

  const getInitialFocusedIndex = useCallback(() => {
    if (options.length === 0) {
      return -1;
    }

    return selectedIndex >= 0 ? selectedIndex : 0;
  }, [options.length, selectedIndex]);

  const focusTrigger = useCallback(() => {
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const closeDropdown = useCallback((returnFocus = false) => {
    setIsOpen(false);
    setFocusedIndex(-1);

    if (returnFocus) {
      focusTrigger();
    }
  }, [focusTrigger]);

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    setFocusedIndex(getInitialFocusedIndex());
  }, [getInitialFocusedIndex]);

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
      const startIndex = currentIndex >= 0 ? currentIndex : getInitialFocusedIndex();
      return (startIndex + direction + options.length) % options.length;
    });
  }, [getInitialFocusedIndex, options.length]);

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>) => {
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
        setFocusedIndex(options.length > 0 ? 0 : -1);
        break;
      case "End":
        event.preventDefault();
        setFocusedIndex(options.length > 0 ? options.length - 1 : -1);
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
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

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
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

    const focusedOption = optionRefs.current[focusedIndex];

    if (!focusedOption) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      focusedOption.focus();
      focusedOption.scrollIntoView({ block: "nearest" });
    });

    return () => cancelAnimationFrame(frameId);
  }, [focusedIndex, isOpen]);

  return (
    <div className={`${styles.container} ${className} ${disabled ? styles.disabled : ""}`} ref={dropdownRef}>
      <button 
        type="button" 
        className={`${styles.trigger} ${isOpen ? styles.open : ""}`}
        onClick={() => {
          if (disabled) {
            return;
          }

          if (isOpen) {
            closeDropdown();
            return;
          }

          openDropdown();
        }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        ref={triggerRef}
      >
        <span className={styles.label}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <FaChevronDown className={styles.icon} />
      </button>

      {isOpen && (
        <div className={`${styles.dropdown} ${menuPlacement === 'top' ? styles.dropdownTop : styles.dropdownBottom}`}>
          <ul className={styles.list} role="listbox" aria-label={listboxLabel} id={listboxId}>
            {options.map((option, index) => {
              const isSelected = value === option.value;
              const isFocused = focusedIndex === index;

              return (
                <li 
                  key={option.value}
                  className={`${styles.option} ${isSelected ? styles.selected : ""} ${isFocused ? styles.focused : ""}`}
                  onClick={() => selectOption(index)}
                  onKeyDown={handleListKeyDown}
                  onFocus={() => setFocusedIndex(index)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                  {isSelected && <FaCheck className={styles.checkIcon} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
