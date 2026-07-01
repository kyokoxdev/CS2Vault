interface CronAuthRequest {
    headers: {
        get(name: string): string | null;
    };
}

export function isCronAuthorized(request: CronAuthRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return false;

    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${cronSecret}`) return true;

    const cronHeader = request.headers.get("x-cron-secret");
    return cronHeader === cronSecret;
}
