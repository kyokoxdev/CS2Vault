/**
 * Authentication Guard
 *
 * Middleware and helper functions to protect API routes and pages.
 * Enforces single-user access when ALLOWED_STEAM_ID is set.
 */

import { auth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";

/**
 * Get the current session or return null.
 * Use this in server components and API routes.
 */
export async function getSession() {
    return auth();
}

/**
 * Require authentication. Returns the session or a 401 response.
 * Use in API route handlers.
 */
export async function requireAuth() {
    const session = await auth();

    if (!session?.user?.steamId) {
        return {
            session: null,
            error: NextResponse.json(
                { success: false, error: "Authentication required" },
                { status: 401 }
            ),
        };
    }

    return { session, error: null };
}

/**
 * Check if the current user is the allowed single user.
 * Returns true if ALLOWED_STEAM_ID is not set (open access)
 * or if the user's SteamID matches.
 */
export function isAllowedUser(steamId: string): boolean {
    const allowedId = process.env.ALLOWED_STEAM_ID;
    if (!allowedId) return true; // No restriction
    return allowedId === steamId;
}
