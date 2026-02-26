/**
 * Steam Login Redirect
 * GET /api/auth/steam/login
 *
 * Redirects the user to Steam's OpenID login page.
 */

import { NextResponse } from "next/server";
import { buildSteamAuthUrl } from "@/lib/auth/steam-openid";

export async function GET() {
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const returnUrl = `${baseUrl}/api/auth/steam/callback`;

    const steamUrl = buildSteamAuthUrl(returnUrl);
    return NextResponse.redirect(steamUrl);
}
