"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./Toast.module.css";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastData {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: "\u2713",
  error: "\u2717",
  warning: "\u26A0",
  info: "\u2139",
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: styles.variantSuccess,
  error: styles.variantError,
  warning: styles.variantWarning,
  info: styles.variantInfo,
};

interface ToastProps {
  data: ToastData;
  onDismiss: (id: string) => void;
}

export function Toast({ data, onDismiss }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(data.id), 300);
  }, [data.id, onDismiss]);

  useEffect(() => {
    if (data.duration <= 0) return;
    const timer = setTimeout(handleDismiss, data.duration);
    return () => clearTimeout(timer);
  }, [data.duration, handleDismiss]);

  const variantClass = VARIANT_CLASS[data.variant];
  const className = [styles.toast, variantClass, exiting ? styles.exiting : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} role="alert" aria-live="assertive">
      <span className={styles.icon}>{VARIANT_ICONS[data.variant]}</span>
      <span className={styles.message}>{data.message}</span>
      <button
        type="button"
        className={styles.closeBtn}
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        &#x2715;
      </button>
    </div>
  );
}
