"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { Toast, type ToastVariant, type ToastData, type ToastAction } from "@/components/ui/Toast";
import styles from "@/components/ui/Toast.module.css";

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

interface ToastContextValue {
  addToast: (message: string, variant: ToastVariant, duration?: number, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { addToast: () => {} };
  }
  return ctx;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback(
    (message: string, variant: ToastVariant, duration?: number, action?: ToastAction) => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      const resolvedDuration = duration ?? DEFAULT_DURATIONS[variant];
      setToasts((prev) => [...prev, { id, message, variant, duration: resolvedDuration, action }]);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className={styles.container}>
        {toasts.map((toast) => (
          <Toast key={toast.id} data={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
