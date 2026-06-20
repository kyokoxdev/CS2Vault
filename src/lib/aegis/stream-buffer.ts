import { appendAegisTrace } from "./ledger";

interface AegisStreamBufferInput {
    runId: string;
    userId: string;
    stage: string;
}

export class AegisStreamBuffer {
    private fullResponse = "";

    constructor(private readonly input: AegisStreamBufferInput) {}

    async append(chunk: string) {
        this.fullResponse += chunk;
        await appendAegisTrace({
            runId: this.input.runId,
            userId: this.input.userId,
            type: "aegis.delta",
            stage: this.input.stage,
            message: chunk,
            payload: { chunk },
        });
    }

    text() {
        return this.fullResponse;
    }
}
