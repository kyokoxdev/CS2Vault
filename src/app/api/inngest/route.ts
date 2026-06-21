import { serve } from "inngest/next";
import { inngest, initInngestClient } from "@/lib/aegis/inngest/client";
import { runAegisVault } from "@/lib/aegis/inngest/functions";

export const maxDuration = 300;

const handler = serve({
    client: inngest,
    functions: [runAegisVault],
});

export async function GET(req: any, res: any) {
    await initInngestClient();
    return handler.GET(req, res);
}

export async function POST(req: any, res: any) {
    await initInngestClient();
    return handler.POST(req, res);
}

export async function PUT(req: any, res: any) {
    await initInngestClient();
    return handler.PUT(req, res);
}
