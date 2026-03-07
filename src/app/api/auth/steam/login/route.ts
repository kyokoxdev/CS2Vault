/**
 * Steam Login Redirect
 * GET /api/auth/steam/login
 *
 * Redirects the user to Steam's OpenID login page.
 */

import { NextResponse } from "next/server";
import { buildSteamAuthUrl } from "@/lib/auth/steam-openid";
import { getBaseUrl } from "@/lib/auth/auth";

export async function GET() {
    const returnUrl = `${getBaseUrl()}/api/auth/steam/callback`;

    const steamUrl = buildSteamAuthUrl(returnUrl);
    return NextResponse.redirect(steamUrl);
}
