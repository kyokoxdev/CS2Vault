/**
 * Google OAuth 2.0 Helper for Gemini Pro Access
 *
 * This module handles Google OAuth token storage and refresh
 * for accessing Gemini 3 Pro-Thinking via the user's Google One subscription.
 *
 * Tokens are stored encrypted in AppSettings.
 * This is SEPARATE from Steam login — it's a "Connect Google Account"
 * flow triggered from the Settings page.
 */

import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/auth/encryption";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * Build the Google OAuth authorization URL.
 */
export function buildGoogleAuthUrl(redirectUri: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID not configured");

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/generative-language",
        access_type: "offline",
        prompt: "consent",
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access/refresh tokens.
 */
export async function exchangeGoogleCode(
    code: string,
    redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID ?? "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Google token exchange failed: ${error}`);
    }

    const data = await res.json();

    if (!data.refresh_token) {
        throw new Error(
            "Google did not return a refresh_token. " +
            "Revoke app access at https://myaccount.google.com/permissions and reconnect."
        );
    }
    if (!data.access_token) {
        throw new Error("Google did not return an access_token.");
    }

    return {
        accessToken: data.access_token as string,
        refreshToken: data.refresh_token as string,
        expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
    };
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshGoogleToken(
    refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: process.env.GOOGLE_CLIENT_ID ?? "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            grant_type: "refresh_token",
        }),
    });

    if (!res.ok) {
        throw new Error("Failed to refresh Google access token");
    }

    const data = await res.json();
    return {
        accessToken: data.access_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
}

/**
 * Store Google OAuth tokens (encrypted) in the database.
 */
export async function storeGoogleTokens(
    accessToken: string,
    refreshToken: string,
    expiresAt: Date
): Promise<void> {
    await prisma.appSettings.update({
        where: { id: "singleton" },
        data: {
            googleAccessToken: encrypt(accessToken),
            googleRefreshToken: encrypt(refreshToken),
            googleTokenExpiry: expiresAt,
        },
    });
}

/**
 * Get a valid Google access token, refreshing if expired.
 * Returns null if no tokens are stored.
 */
export async function getValidGoogleToken(): Promise<string | null> {
    const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
    });

    if (!settings?.googleAccessToken || !settings?.googleRefreshToken) {
        return null;
    }

    const accessToken = decrypt(settings.googleAccessToken);
    const refreshToken = decrypt(settings.googleRefreshToken);
    const expiry = settings.googleTokenExpiry;

    // If token is still valid (with 5 min buffer), return it
    if (expiry && expiry.getTime() > Date.now() + 5 * 60 * 1000) {
        return accessToken;
    }

    // Token expired — refresh it
    try {
        const refreshed = await refreshGoogleToken(refreshToken);
        await storeGoogleTokens(refreshed.accessToken, refreshToken, refreshed.expiresAt);
        return refreshed.accessToken;
    } catch (error) {
        console.error("[GoogleOAuth] Token refresh failed:", error);
        return null;
    }
}

/**
 * Check if Google OAuth is connected.
 */
export async function isGoogleConnected(): Promise<boolean> {
    const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
        select: { googleRefreshToken: true },
    });
    return !!settings?.googleRefreshToken;
}

/**
 * Disconnect Google OAuth — remove stored tokens.
 */
export async function disconnectGoogle(): Promise<void> {
    await prisma.appSettings.update({
        where: { id: "singleton" },
        data: {
            googleAccessToken: null,
            googleRefreshToken: null,
            googleTokenExpiry: null,
        },
    });
}
