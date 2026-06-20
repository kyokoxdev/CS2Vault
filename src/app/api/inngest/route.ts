import { serve } from "inngest/next";
import { inngest } from "@/lib/aegis/inngest/client";
import { runAegisVault } from "@/lib/aegis/inngest/functions";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [runAegisVault],
});
