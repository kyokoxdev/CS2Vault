"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-0, #000000)",
          color: "var(--text-primary-90, rgba(255, 255, 255, 0.9))",
          fontFamily:
            "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            padding: 32,
            background: "var(--surface-2, #141414)",
            border: "1px solid var(--border-primary, #262626)",
            borderRadius: 10,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
              color: "var(--bear, #FF4D4F)",
            }}
            aria-hidden="true"
          >
            ⚠
          </div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 8,
              color: "var(--text-primary-90, rgba(255, 255, 255, 0.9))",
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary-60, #8C8C8C)",
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            A critical error occurred. Please try again or refresh the page.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-secondary-60, #8C8C8C)",
                marginBottom: 16,
                fontFamily: "monospace",
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
              background: "var(--text-primary-90, rgba(255, 255, 255, 0.9))",
              color: "var(--surface-0, #000000)",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
