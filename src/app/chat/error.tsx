"use client";

import { useEffect } from "react";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          padding: 32,
          background: "var(--surface-2)",
          border: "1px solid var(--border-primary)",
          borderRadius: 10,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 40,
            marginBottom: 12,
            color: "var(--bear)",
          }}
          aria-hidden="true"
        >
          ⚠
        </div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 8,
            color: "var(--text-primary-90)",
          }}
        >
          Chat Unavailable
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary-60)",
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          The AI chat encountered an error. This may be due to a streaming
          connection issue or service disruption.
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: 11,
              color: "var(--text-secondary-60)",
              marginBottom: 16,
              fontFamily: "var(--font-mono)",
            }}
          >
            Error ID: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "10px 24px",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "inherit",
            background: "var(--text-primary-90)",
            color: "var(--surface-0)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
