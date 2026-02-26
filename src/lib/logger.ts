/**
 * Structured Logger
 *
 * Provides consistent, parseable log output across the application.
 * Uses JSON format in production, human-readable in development.
 * All log entries include timestamp, level, module, and message.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    data?: Record<string, unknown>;
}

const isDev = process.env.NODE_ENV !== "production";

function formatEntry(entry: LogEntry): string {
    if (isDev) {
        const icon = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" }[entry.level];
        const data = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
        return `${icon} [${entry.module}] ${entry.message}${data}`;
    }
    return JSON.stringify(entry);
}

function log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        module,
        message,
        ...(data ? { data } : {}),
    };

    const formatted = formatEntry(entry);

    switch (level) {
        case "debug":
            if (isDev) console.debug(formatted);
            break;
        case "info":
            console.info(formatted);
            break;
        case "warn":
            console.warn(formatted);
            break;
        case "error":
            console.error(formatted);
            break;
    }
}

/**
 * Create a scoped logger for a specific module.
 *
 * Usage:
 *   const log = createLogger("Market:Sync");
 *   log.info("Sync started", { itemCount: 5 });
 *   log.error("Sync failed", { error: err.message });
 */
export function createLogger(module: string) {
    return {
        debug: (message: string, data?: Record<string, unknown>) => log("debug", module, message, data),
        info: (message: string, data?: Record<string, unknown>) => log("info", module, message, data),
        warn: (message: string, data?: Record<string, unknown>) => log("warn", module, message, data),
        error: (message: string, data?: Record<string, unknown>) => log("error", module, message, data),
    };
}
