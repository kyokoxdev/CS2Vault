import { AEGIS_RUN_REQUESTED } from "../events";
import { runDurableAegis } from "../runner";
import { appendAegisLog, appendAegisTrace, failAegisRun, transitionAegisRun } from "../ledger";
import { inngest } from "./client";

export const runAegisVault = inngest.createFunction(
    { id: "aegis-vault-run", triggers: [{ event: AEGIS_RUN_REQUESTED }] },
    async ({ event, step }) => {
        const { runId, userId } = event.data;

        try {
            await step.run("mark-run-running", async () => {
                await transitionAegisRun(runId, userId, "running");
                await appendAegisTrace({
                    runId,
                    userId,
                    type: "aegis.stage",
                    stage: "runner",
                    message: "Aegis durable runner started.",
                });
            });

            const result = await step.run("run-researcher-consultant", async () => {
                return runDurableAegis(runId, userId);
            });

            return { runId, responseLength: result.finalResponse.length };
        } catch (error) {
            await step.run("mark-run-failed", async () => {
                await markAegisRunFailed(runId, userId, error);
            });
            throw error;
        }
    }
);

export async function markAegisRunFailed(runId: string, userId: string, error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected Aegis runner failure";
    await appendAegisLog({
        runId,
        userId,
        type: "runner_error",
        level: "error",
        message,
        error: message,
    });
    await appendAegisTrace({
        runId,
        userId,
        type: "aegis.error",
        stage: "runner",
        message,
        error: message,
    });
    await failAegisRun(runId, userId, message);
}
