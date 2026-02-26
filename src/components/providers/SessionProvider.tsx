"use client";

/**
 * NextAuth Session Provider Wrapper
 * Provides session context to all client components via useSession().
 */

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export default function SessionProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
