/**
 * Simple AES-256-GCM Encryption for Token Storage
 *
 * Uses TOKEN_ENCRYPTION_KEY from environment.
 * Tokens are encrypted before storing in the database
 * and decrypted when read.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) {
        throw new Error(
            "TOKEN_ENCRYPTION_KEY not set. Generate one with: " +
            "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
    }
    // AES-256-GCM requires exactly 32 bytes = 64 hex characters.
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
        throw new Error(
            `TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ` +
            `Current length: ${key.length} characters. ` +
            `Generate a valid key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
        );
    }
    return Buffer.from(key, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns: base64(iv + ciphertext + authTag)
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, "utf8");
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const tag = cipher.getAuthTag();

    // Combine: iv (16) + ciphertext (variable) + tag (16)
    const combined = Buffer.concat([iv, ciphertext, tag]);
    return combined.toString("base64");
}

/**
 * Decrypt a ciphertext string.
 * Input: base64(iv + ciphertext + authTag)
 */
export function decrypt(encryptedBase64: string): string {
    const key = getKey();
    const combined = Buffer.from(encryptedBase64, "base64");

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
    return plaintext.toString("utf8");
}
