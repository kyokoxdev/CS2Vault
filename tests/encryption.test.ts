/**
 * Unit Tests: Encryption (AES-256-GCM)
 */

import { describe, it, expect, beforeAll } from "vitest";

// Set a test encryption key (32 bytes = 64 hex chars)
beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

import { encrypt, decrypt } from "@/lib/auth/encryption";

describe("encryption", () => {
    it("encrypt/decrypt roundtrip works", () => {
        const original = "my-secret-access-token-12345";
        const encrypted = encrypt(original);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(original);
    });

    it("encrypted output is base64", () => {
        const encrypted = encrypt("test");
        expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("different encryptions produce different ciphertexts (random IV)", () => {
        const a = encrypt("same-input");
        const b = encrypt("same-input");
        expect(a).not.toBe(b); // Different IVs
        expect(decrypt(a)).toBe("same-input");
        expect(decrypt(b)).toBe("same-input");
    });

    it("handles empty string", () => {
        const encrypted = encrypt("");
        expect(decrypt(encrypted)).toBe("");
    });

    it("handles unicode", () => {
        const original = "トークン🔐secret";
        expect(decrypt(encrypt(original))).toBe(original);
    });

    it("rejects tampered ciphertext", () => {
        const encrypted = encrypt("test");
        const tampered = encrypted.slice(0, -4) + "AAAA";
        expect(() => decrypt(tampered)).toThrow();
    });
});
