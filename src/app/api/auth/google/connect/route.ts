/**
 * Google OAuth Routes
 * GET /api/auth/google/connect — Start Google OAuth flow
 * GET /api/auth/google/callback — Handle Google OAuth callback
 * DELETE /api/auth/google/connect — Disconnect Google account
 */

import { NextResponse } from "next/server";
import { auth, getBaseUrl } from "@/lib/auth/auth";
import { buildGoogleAuthUrl, disconnectGoogle } from "@/lib/auth/google-oauth";

/**
 * GET — Redirect user to Google OAuth consent screen.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json(
            { success: false, error: "Login required" },
            { status: 401 }
        );
    }

    const redirectUri = `${getBaseUrl()}/api/auth/google/callback`;

    try {
        const authUrl = buildGoogleAuthUrl(redirectUri);
        return NextResponse.redirect(authUrl);
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to build auth URL",
            },
            { status: 500 }
        );
    }
}

/**
 * DELETE — Disconnect Google account (remove stored tokens).
 */
export async function DELETE() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json(
            { success: false, error: "Login required" },
            { status: 401 }
        );
    }

    await disconnectGoogle();
    return NextResponse.json({ success: true, data: { disconnected: true } });
}
