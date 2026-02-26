/**
 * Steam OpenID Callback
 * GET /api/auth/steam/callback
 *
 * Steam redirects here after the user authenticates.
 * We verify the OpenID assertion, extract SteamID,
 * then sign the user in via NextAuth Credentials provider.
 */

import { NextRequest, NextResponse } from "next/server";
import {
    extractSteamId,
    verifySteamAssertion,
    fetchSteamProfile,
} from "@/lib/auth/steam-openid";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth/auth";

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;

    // Step 1: Verify the OpenID assertion with Steam
    const isValid = await verifySteamAssertion(params);
    if (!isValid) {
        const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        return NextResponse.redirect(
            `${baseUrl}/login?error=steam_verification_failed`
        );
    }

    // Step 2: Extract SteamID from claimed_id
    const claimedId = params.get("openid.claimed_id") ?? "";
    const steamId = extractSteamId(claimedId);
    if (!steamId) {
        const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        return NextResponse.redirect(
            `${baseUrl}/login?error=invalid_steam_id`
        );
    }

    // Step 3: Single-user guard
    const allowedId = process.env.ALLOWED_STEAM_ID;
    if (allowedId && allowedId !== steamId) {
        const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        return NextResponse.redirect(
            `${baseUrl}/login?error=access_denied`
        );
    }

    // Step 4: Fetch profile and upsert user
    const profile = await fetchSteamProfile(steamId);
    const displayName = profile?.personaname ?? `User ${steamId}`;
    const avatarUrl = profile?.avatarfull ?? null;

    await prisma.user.upsert({
        where: { steamId },
        update: { displayName, avatarUrl, lastLogin: new Date() },
        create: { steamId, displayName, avatarUrl },
    });

    // Step 5: Sign in with NextAuth using the Credentials provider
    // In NextAuth v5, signIn() throws a NEXT_REDIRECT error that carries
    // the session cookie. We must let it propagate to set the cookie.
    // Using redirectTo sends the user to the dashboard after login.
    await signIn("steam", {
        steamId,
        redirectTo: "/",
    });
    // signIn will throw a redirect — this line is unreachable
    // but acts as a fallback just in case
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/`);
}
