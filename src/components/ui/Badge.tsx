/**
 * Badge Component
 * Reusable colored status badge for marking item states
 */

import { ReactNode } from "react";
import styles from "./Badge.module.css";

export interface BadgeProps {
  children: ReactNode;
  variant: "success" | "danger" | "warning" | "neutral" | "info";
  size?: "sm" | "md";
}

export function Badge({ children, variant, size = "md" }: BadgeProps) {
  const sizeClass = size === "sm" ? styles.sizeSm : styles.sizeMd;
  const variantClass = styles[variant];

  return (
    <span className={`${styles.badge} ${variantClass} ${sizeClass}`}>
      {children}
    </span>
  );
}
