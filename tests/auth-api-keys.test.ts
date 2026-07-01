import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/encryption", () => ({
    encrypt: vi.fn((value: string) => `encrypted:${value}`),
    decrypt: vi.fn((value: string) => {
        if (value.startsWith("encrypted:")) return value.slice("encrypted:".length);
        throw new Error("legacy plaintext");
    }),
}));

import { encrypt, decrypt } from "@/lib/auth/encryption";
import { decryptApiKey, encryptApiKey } from "@/lib/auth/api-keys";

describe("API key encryption helpers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("throws instead of storing plaintext when encryption fails", () => {
        vi.mocked(encrypt).mockImplementationOnce(() => {
            throw new Error("bad key");
        });

        expect(() => encryptApiKey("secret-key")).toThrow("bad key");
    });

    it("keeps plaintext fallback for legacy stored keys during decryption", () => {
        expect(decryptApiKey("legacy-key")).toBe("legacy-key");
        expect(decrypt).toHaveBeenCalledWith("legacy-key");
    });
});
