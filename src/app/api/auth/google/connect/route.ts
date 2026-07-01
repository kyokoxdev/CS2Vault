/**
 * Google OAuth Routes
 * GET /api/auth/google/connect — Start Google OAuth flow
 * GET /api/auth/google/callback — Handle Google OAuth callback
 * DELETE /api/auth/google/connect — Disconnect Google account
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { auth, getBaseUrl } from "@/lib/auth/auth";
import { buildGoogleAuthUrl, disconnectGoogle } from "@/lib/auth/google-oauth";

const GOOGLE_OAUTH_STATE_COOKIE = "cs2vault_google_oauth_state";
const GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60;

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
        const state = randomBytes(32).toString("base64url");
        const authUrl = buildGoogleAuthUrl(redirectUri, state);
        const response = NextResponse.redirect(authUrl);

        response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/api/auth/google",
            maxAge: GOOGLE_OAUTH_STATE_TTL_SECONDS,
        });

        return response;
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
