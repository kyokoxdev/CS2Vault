/**
 * NextAuth v5 Route Handler
 * GET/POST /api/auth/[...nextauth]
 */

import { handlers } from "@/lib/auth/auth";

export const { GET, POST } = handlers;
