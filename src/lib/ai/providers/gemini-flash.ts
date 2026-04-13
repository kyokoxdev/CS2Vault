import type { AIProvider, ChatMessageData, MarketContext } from '@/types';
import { prisma } from '@/lib/db';
import { isRateLimitError } from '@/lib/api-queue';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { decryptApiKey } from '@/lib/auth/api-keys';

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 3000;

export class GeminiFlashProvider implements AIProvider {
    name = "gemini-flash";
    requiresOAuth = false;

    async isAuthenticated(): Promise<boolean> {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
        return !!(decryptApiKey(settings?.geminiApiKey) || process.env.GEMINI_API_KEY);
    }

    getModelName(): string {
        return "gemini-2.5-flash";
    }

    async *chat(messages: ChatMessageData[], context: MarketContext): AsyncGenerator<string> {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
        const apiKey = decryptApiKey(settings?.geminiApiKey) || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("Gemini API key not configured. Add it in Settings.");
        }

        const filteredMessages = messages.filter(m => m.role !== 'system');
        const contents = filteredMessages.map(m => {
            const parts: Array<{ text?: string, inlineData?: { mimeType: string, data: string } }> = [{ text: m.content }];
            if (m.imageBase64) {
                const match = m.imageBase64.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/);
                if (match) {
                    parts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2]
                        }
                    });
                }
            }
            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts
            };
        });

        const body = {
            contents,
            systemInstruction: { parts: [{ text: buildSystemPrompt(context) }] }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`;

        let response: Response | null = null;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey,
                    },
                    body: JSON.stringify(body)
                });

                if (response.ok) {
                    lastError = null;
                    break;
                }

                const errorText = await response.text();
                const error = new Error(`Gemini Flash API Error (${response.status}): ${errorText}`);

                if (response.status === 429 && attempt < MAX_RETRIES) {
                    const retryAfter = response.headers.get('retry-after');
                    const backoffMs = retryAfter
                        ? parseInt(retryAfter, 10) * 1000
                        : BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
                    console.warn(
                        `[Gemini Flash] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}). ` +
                        `Retrying in ${Math.round(backoffMs)}ms...`
                    );
                    await new Promise(r => setTimeout(r, backoffMs));
                    lastError = error;
                    response = null;
                    continue;
                }

                throw error;
            } catch (error) {
                if (isRateLimitError(error) && attempt < MAX_RETRIES) {
                    const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
                    console.warn(
                        `[Gemini Flash] Rate limit error (attempt ${attempt + 1}/${MAX_RETRIES}). ` +
                        `Retrying in ${Math.round(backoffMs)}ms...`
                    );
                    await new Promise(r => setTimeout(r, backoffMs));
                    lastError = error instanceof Error ? error : new Error(String(error));
                    response = null;
                    continue;
                }
                throw error;
            }
        }

        if (!response || !response.ok) {
            throw lastError ?? new Error("Gemini Flash API request failed after retries");
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr.trim() === '[DONE]') continue;
                    try {
                        const data = JSON.parse(dataStr);
                        const textChunk = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (textChunk) yield textChunk;
                    } catch {
                        // ignore parse errors for partial lines
                    }
                }
            }
        }
    }
}
