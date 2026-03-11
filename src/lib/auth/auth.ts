/**
 * NextAuth v5 Configuration
 *
 * Central auth config for CS2Vault. Handles:
 * - Steam OpenID 2.0 login (primary auth)
 * - Single-user access guard (ALLOWED_STEAM_ID)
 * - Session management with JWT
 *
 * Architecture:
 * - auth.ts (this file) — NextAuth config & exports
 * - steam-openid.ts — Steam OpenID 2.0 helpers
 * - guard.ts — single-user access middleware
 * - google-oauth.ts — Google OAuth for AI (Phase 6)
 */

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

export function getBaseUrl(): string {
    if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
}

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            steamId: string;
            name: string;
            image?: string;
        };
    }

    interface User {
        steamId: string;
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        /**
         * Steam "Credentials" provider.
         *
         * We use Credentials because Steam OpenID 2.0 is not a standard
         * OAuth flow. The actual OpenID handshake happens in our custom
         * API routes (/api/auth/steam/*), and the result is passed here
         * with the SteamID already verified.
         */
        CredentialsProvider({
            id: "steam",
            name: "Steam",
            credentials: {
                steamId: { label: "Steam ID", type: "text" },
            },
            async authorize(credentials) {
                const steamId = credentials?.steamId as string | undefined;
                if (!steamId) return null;

                // Single-user guard
                const allowedId = process.env.ALLOWED_STEAM_ID;
                if (allowedId && allowedId !== steamId) {
                    console.warn(`[Auth] Rejected SteamID ${steamId} — only ${allowedId} allowed`);
                    return null;
                }

                // Look up user in DB (already upserted by the callback route)
                const dbUser = await prisma.user.findUnique({ where: { steamId } });
                if (!dbUser) return null;

                return {
                    id: dbUser.id,
                    steamId: dbUser.steamId,
                    name: dbUser.displayName,
                    image: dbUser.avatarUrl,
                };
            },
        }),
    ],

    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.steamId = (user as { steamId: string }).steamId;
                token.dbUserId = user.id!;
            }
            return token;
        },

        async session({ session, token }) {
            session.user.id = token.dbUserId as string;
            session.user.steamId = token.steamId as string;
            return session;
        },
    },

    pages: {
        signIn: "/startup",
        error: "/startup",
    },

    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },

    secret: process.env.NEXTAUTH_SECRET,
});
