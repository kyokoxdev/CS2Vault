/**
 * Google OAuth Callback
 * GET /api/auth/google/callback
 *
 * Handles the redirect from Google after the user grants consent.
 * Exchanges the authorization code for tokens and stores them encrypted.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { auth, getBaseUrl } from "@/lib/auth/auth";
import {
    exchangeGoogleCode,
    storeGoogleTokens,
} from "@/lib/auth/google-oauth";

const GOOGLE_OAUTH_STATE_COOKIE = "cs2vault_google_oauth_state";

function redirectWithClearedState(url: string): NextResponse {
    const response = NextResponse.redirect(url);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/auth/google",
        maxAge: 0,
    });
    return response;
}

function statesMatch(actual: string | null, expected: string | undefined): boolean {
    if (!actual || !expected) return false;

    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
    const session = await auth();
    const baseUrl = getBaseUrl();

    if (!session?.user) {
        return redirectWithClearedState(`${baseUrl}/login`);
    }

    const code = request.nextUrl.searchParams.get("code");
    const error = request.nextUrl.searchParams.get("error");
    const state = request.nextUrl.searchParams.get("state");
    const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

    if (!statesMatch(state, expectedState)) {
        return redirectWithClearedState(`${baseUrl}/settings?google_error=invalid_state`);
    }

    if (error) {
        return redirectWithClearedState(
            `${baseUrl}/settings?google_error=${encodeURIComponent(error)}`
        );
    }

    if (!code) {
        return redirectWithClearedState(
            `${baseUrl}/settings?google_error=no_code`
        );
    }

    try {
        const redirectUri = `${baseUrl}/api/auth/google/callback`;
        const tokens = await exchangeGoogleCode(code, redirectUri);
        await storeGoogleTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresAt);

        return redirectWithClearedState(`${baseUrl}/settings?google_connected=true`);
    } catch (err) {
        console.error("[GoogleOAuth] Token exchange failed:", err);
        return redirectWithClearedState(
            `${baseUrl}/settings?google_error=token_exchange_failed`
        );
    }
}
