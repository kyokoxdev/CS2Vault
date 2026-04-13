import { encrypt, decrypt } from "@/lib/auth/encryption";

/**
 * Encrypts an API key for DB storage.
 * Returns null if input is null/empty.
 */
export function encryptApiKey(plaintext: string | null | undefined): string | null {
    if (!plaintext) return null;
    try {
        return encrypt(plaintext);
    } catch {
        return plaintext;
    }
}

/**
 * Decrypts an API key from DB storage.
 * Falls back to treating the value as plaintext for backward compatibility
 * with keys stored before encryption was added.
 */
export function decryptApiKey(stored: string | null | undefined): string | null {
    if (!stored) return null;
    try {
        return decrypt(stored);
    } catch {
        // Pre-encryption plaintext key — return as-is
        return stored;
    }
}
