import { inngest } from "./inngest/client";
import { createAegisRunRequestedEvent } from "./events";
import { appendAegisTrace, createAegisRun } from "./ledger";
import type { CreateAegisRunInput } from "./types";

export async function createAndDispatchAegisRun(input: CreateAegisRunInput) {
    const run = await createAegisRun(input);

    await appendAegisTrace({
        runId: run.id,
        userId: run.userId,
        type: "aegis.stage",
        stage: "queued",
        message: "Aegis run queued.",
    });

    await inngest.send(createAegisRunRequestedEvent(run.id, run.userId));

    return run;
}
