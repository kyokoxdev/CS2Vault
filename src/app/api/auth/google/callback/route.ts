/**
 * Google OAuth Callback
 * GET /api/auth/google/callback
 *
 * Handles the redirect from Google after the user grants consent.
 * Exchanges the authorization code for tokens and stores them encrypted.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import {
    exchangeGoogleCode,
    storeGoogleTokens,
} from "@/lib/auth/google-oauth";

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        return NextResponse.redirect(`${baseUrl}/login`);
    }

    const code = request.nextUrl.searchParams.get("code");
    const error = request.nextUrl.searchParams.get("error");
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    if (error) {
        return NextResponse.redirect(
            `${baseUrl}/settings?google_error=${encodeURIComponent(error)}`
        );
    }

    if (!code) {
        return NextResponse.redirect(
            `${baseUrl}/settings?google_error=no_code`
        );
    }

    try {
        const redirectUri = `${baseUrl}/api/auth/google/callback`;
        const tokens = await exchangeGoogleCode(code, redirectUri);
        await storeGoogleTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresAt);

        return NextResponse.redirect(`${baseUrl}/settings?google_connected=true`);
    } catch (err) {
        console.error("[GoogleOAuth] Token exchange failed:", err);
        return NextResponse.redirect(
            `${baseUrl}/settings?google_error=token_exchange_failed`
        );
    }
}
