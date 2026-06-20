import { describe, expect, it } from "vitest";
import { parseAegisStreamChunk } from "@/components/chat/aegisStream";

describe("parseAegisStreamChunk", () => {
    it("parses completed Aegis event frames", () => {
        const input = [
            "event: aegis.delta",
            "data: {\"type\":\"aegis.delta\",\"message\":\"hello\",\"payload\":{\"chunk\":\"hello\"}}",
            "",
            "event: aegis.action_preview",
            "data: {\"type\":\"aegis.action_preview\",\"message\":\"Preview\",\"payload\":{\"actionId\":\"action-1\"}}",
            "",
            "",
        ].join("\n");

        const parsed = parseAegisStreamChunk(input);

        expect(parsed.remainder).toBe("");
        expect(parsed.rawText).toBe("");
        expect(parsed.events).toEqual([
            expect.objectContaining({ type: "aegis.delta", message: "hello" }),
            expect.objectContaining({ type: "aegis.action_preview", message: "Preview" }),
        ]);
    });

    it("preserves incomplete event frames as remainder", () => {
        const parsed = parseAegisStreamChunk("event: aegis.delta\ndata: {\"type\":\"aegis.delta\"");

        expect(parsed.events).toEqual([]);
        expect(parsed.rawText).toBe("");
        expect(parsed.remainder).toBe("event: aegis.delta\ndata: {\"type\":\"aegis.delta\"");
    });

    it("returns raw text for backward-compatible streams", () => {
        const parsed = parseAegisStreamChunk("plain assistant chunk");

        expect(parsed).toEqual({ events: [], remainder: "", rawText: "plain assistant chunk" });
    });
});
