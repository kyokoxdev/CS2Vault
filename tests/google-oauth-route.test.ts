import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth/auth", () => ({
    auth: vi.fn(),
    getBaseUrl: vi.fn(() => "http://localhost"),
}));

vi.mock("@/lib/auth/google-oauth", () => ({
    buildGoogleAuthUrl: vi.fn((_redirectUri: string, state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
    disconnectGoogle: vi.fn(),
    exchangeGoogleCode: vi.fn(),
    storeGoogleTokens: vi.fn(),
}));

import { auth } from "@/lib/auth/auth";
import { buildGoogleAuthUrl, exchangeGoogleCode, storeGoogleTokens } from "@/lib/auth/google-oauth";
import { GET as connectGoogle } from "@/app/api/auth/google/connect/route";
import { GET as googleCallback } from "@/app/api/auth/google/callback/route";

function mockCallbackRequest(url: string, cookieValue?: string): NextRequest {
    return {
        nextUrl: new URL(url),
        cookies: {
            get: vi.fn(() => cookieValue ? { value: cookieValue } : undefined),
        },
    } as unknown as NextRequest;
}

describe("Google OAuth routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    });

    it("sets an HttpOnly state cookie and includes state in the Google auth URL", async () => {
        const response = await connectGoogle();
        const state = vi.mocked(buildGoogleAuthUrl).mock.calls[0]?.[1];

        expect(state).toEqual(expect.any(String));
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(`https://accounts.google.com/o/oauth2/v2/auth?state=${state}`);
        expect(response.headers.get("set-cookie")).toContain("cs2vault_google_oauth_state=");
        expect(response.headers.get("set-cookie")).toContain("HttpOnly");
        expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    });

    it("rejects callback state mismatch before token exchange", async () => {
        const response = await googleCallback(mockCallbackRequest(
            "http://localhost/api/auth/google/callback?code=abc&state=actual",
            "expected"
        ));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("http://localhost/settings?google_error=invalid_state");
        expect(exchangeGoogleCode).not.toHaveBeenCalled();
        expect(storeGoogleTokens).not.toHaveBeenCalled();
        expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    });

    it("clears callback state when the user session is missing", async () => {
        vi.mocked(auth).mockResolvedValue(null);

        const response = await googleCallback(mockCallbackRequest(
            "http://localhost/api/auth/google/callback?code=abc&state=expected",
            "expected"
        ));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("http://localhost/login");
        expect(exchangeGoogleCode).not.toHaveBeenCalled();
        expect(storeGoogleTokens).not.toHaveBeenCalled();
        expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    });
});
