import type { AegisRunRequestedEvent } from "./types";

export const AEGIS_RUN_REQUESTED = "aegis/run.requested" as const;

export function createAegisRunRequestedEvent(runId: string, userId: string): AegisRunRequestedEvent {
    return {
        name: AEGIS_RUN_REQUESTED,
        data: { runId, userId },
    };
}
