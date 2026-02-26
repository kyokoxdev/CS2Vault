/**
 * Next.js Middleware — Auth Gate
 *
 * Protects API routes that require authentication.
 * 
 * NOTE: This runs in the Edge Runtime, so it CANNOT import Prisma 
 * or any Node.js-only modules. We use pure JWT/cookie checking here.
 * Full session validation happens in the route handlers via auth().
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that do NOT require authentication
const PUBLIC_PREFIXES = [
    "/api/auth",        // All auth routes (login, callback, nextauth)
    "/api/search",      // Item search (needs to work before login)
    "/login",           // Login page
    "/test",            // Smoke test page
];

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public prefixes (auth routes, search, etc.)
    if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return NextResponse.next();
    }

    // For /api/* routes, check for the NextAuth session cookie
    if (pathname.startsWith("/api/")) {
        // In development, skip auth enforcement (no Steam login needed)
        if (process.env.NODE_ENV === "development") {
            return NextResponse.next();
        }

        const sessionCookie =
            request.cookies.get("authjs.session-token") ??
            request.cookies.get("__Secure-authjs.session-token");

        if (!sessionCookie?.value) {
            return NextResponse.json(
                { success: false, error: "Authentication required" },
                { status: 401 }
            );
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Run on API routes only (skip static files, _next, etc.)
        "/api/:path*",
    ],
};
