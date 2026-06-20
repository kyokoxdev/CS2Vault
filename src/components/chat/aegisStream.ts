import type { AegisTraceEventType } from "@/lib/aegis/types";

export interface AegisClientStreamEvent {
    type: AegisTraceEventType;
    sequence?: number;
    stage?: string | null;
    message?: string | null;
    payload?: unknown;
    error?: string | null;
}

export interface ParsedAegisStreamChunk {
    events: AegisClientStreamEvent[];
    remainder: string;
    rawText: string;
}

function parseFrame(frame: string): AegisClientStreamEvent | null {
    const dataLines = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) return null;

    try {
        return JSON.parse(dataLines.join("\n")) as AegisClientStreamEvent;
    } catch (error) {
        if (process.env.NODE_ENV !== "test") {
            console.warn("[AegisStream] Failed to parse stream frame", error);
        }
        return null;
    }
}

export function parseAegisStreamChunk(input: string): ParsedAegisStreamChunk {
    if (!input.includes("data:") && !input.includes("event:")) {
        return { events: [], remainder: "", rawText: input };
    }

    const frames = input.split(/\n\n/);
    const remainder = frames.pop() ?? "";
    const events: AegisClientStreamEvent[] = [];
    let rawText = "";

    for (const frame of frames) {
        if (!frame.trim()) continue;
        const event = parseFrame(frame);
        if (event) {
            events.push(event);
        } else {
            rawText += frame;
        }
    }

    return { events, remainder, rawText };
}
