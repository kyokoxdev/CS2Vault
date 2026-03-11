/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from "vitest";
import "./setup-component";

import type { NextRequest } from "next/server";
import { proxy } from "@/proxy";

type Cookies = {
    get: (name: string) => { value: string } | undefined;
};

function makeRequest(pathname: string, hasSession: boolean): NextRequest {
    const nextUrl = new URL(`http://localhost${pathname}`);
    const cookies: Cookies = {
        get: (name: string) =>
            hasSession && name === "authjs.session-token"
                ? { value: "fake-token" }
                : undefined,
    };
    return { nextUrl, cookies } as unknown as NextRequest;
}

describe("proxy", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("redirects unauthenticated user on / to /startup", async () => {
        const res = proxy(makeRequest("/", false));
        if (!res) throw new Error("Expected middleware to return a Response");
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("http://localhost/startup");
    });

    it("allows unauthenticated user through on /startup", async () => {
        const res = proxy(makeRequest("/startup", false));
        if (!res) throw new Error("Expected middleware to return a Response");
        expect(res.headers.get("x-middleware-next")).toBe("1");
        expect(res.headers.get("location")).toBeNull();
    });

    it("redirects authenticated user on /startup to /", async () => {
        const res = proxy(makeRequest("/startup", true));
        if (!res) throw new Error("Expected middleware to return a Response");
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("http://localhost/");
    });

    it("allows authenticated user through on /", async () => {
        const res = proxy(makeRequest("/", true));
        if (!res) throw new Error("Expected middleware to return a Response");
        expect(res.headers.get("x-middleware-next")).toBe("1");
        expect(res.headers.get("location")).toBeNull();
    });

    it("returns 401 for protected api routes without session", async () => {
        const res = proxy(makeRequest("/api/private", false));
        if (!res) throw new Error("Expected middleware to return a Response");
        expect(res.status).toBe(401);
        expect(res.headers.get("content-type")).toMatch(/application\/json/);
    });

    it("allows public api routes without session", async () => {
        const res = proxy(makeRequest("/api/auth/signin", false));
        if (!res) throw new Error("Expected middleware to return a Response");
        expect(res.headers.get("x-middleware-next")).toBe("1");
    });
});
