"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./FallbackToast.module.css";

export interface FallbackToastProps {
  /** The reason the primary provider failed */
  failureReason: string;
  /** Which provider was attempted */
  attemptedProvider: string;
  /** Called when user approves fallback to Steam */
  onApprove: () => void;
  /** Called when user dismisses (or auto-dismiss timeout) */
  onDismiss: () => void;
  /** Auto-dismiss timeout in ms (default 15000) */
  autoCloseMs?: number;
}

export function FallbackToast({
  failureReason,
  onApprove,
  onDismiss,
  autoCloseMs = 15000,
}: FallbackToastProps) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 300); // Match CSS animation duration
  }, [onDismiss]);

  const handleApprove = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onApprove();
    }, 300);
  }, [onApprove]);

  useEffect(() => {
    if (autoCloseMs <= 0) return;
    const timer = setTimeout(handleClose, autoCloseMs);
    return () => clearTimeout(timer);
  }, [autoCloseMs, handleClose]);

  if (!visible) return null;

  return (
    <div className={`${styles.toast} ${exiting ? styles.exiting : ""}`}>
      <div className={styles.icon}>⚠️</div>
      <div className={styles.content}>
        <div className={styles.title}>Price provider unavailable</div>
        <div className={styles.message}>{failureReason}</div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.approveBtn} onClick={handleApprove}>
          Use Steam
        </button>
        <button type="button" className={styles.dismissBtn} onClick={handleClose} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
