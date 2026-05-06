"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import styles from "./Toast.module.css";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  action?: ToastAction;
}

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
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
  const reducedMotion = useReducedMotion();
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
  const className = [styles.toast, variantClass]
    .filter(Boolean)
    .join(" ");

  const motionProps = reducedMotion ? {} : {
    layout: true,
    initial: { opacity: 0, x: 50, scale: 0.95 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }
  };

  return (
    <motion.div className={className} role="alert" aria-live="assertive" {...motionProps}>
      <span className={styles.icon}>{VARIANT_ICONS[data.variant]}</span>
      <span className={styles.message}>{data.message}</span>
      {data.action && (
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => {
            data.action!.onClick();
            handleDismiss();
          }}
        >
          {data.action.label}
        </button>
      )}
      <button
        type="button"
        className={styles.closeBtn}
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        &#x2715;
      </button>
    </motion.div>
  );
}
