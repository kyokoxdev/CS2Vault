import type { AegisTraceEventType } from "./types";

export interface AegisStreamEvent {
    type: AegisTraceEventType;
    sequence?: number;
    stage?: string | null;
    message?: string | null;
    payload?: unknown;
    error?: string | null;
}

export function serializeAegisStreamEvent(event: AegisStreamEvent) {
    return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
