"use client";

import { useState, useRef, useEffect } from "react";
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`${styles.container} ${className} ${disabled ? styles.disabled : ""}`} ref={dropdownRef}>
      <button 
        type="button" 
        className={`${styles.trigger} ${isOpen ? styles.open : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={styles.label}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <FaChevronDown className={styles.icon} />
      </button>

      {isOpen && (
        <div className={`${styles.dropdown} ${menuPlacement === 'top' ? styles.dropdownTop : styles.dropdownBottom}`}>
          <ul className={styles.list}>
            {options.map((option) => (
              <li 
                key={option.value}
                className={`${styles.option} ${value === option.value ? styles.selected : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className={styles.optionLabel}>{option.label}</span>
                {value === option.value && <FaCheck className={styles.checkIcon} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
