import type { AIProvider, ChatMessageData, MarketContext } from '@/types';
import { prisma } from '@/lib/db';
import { geminiFlashQueue } from '@/lib/api-queue';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { decryptApiKey } from '@/lib/auth/api-keys';

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

        while (contents.length > 0 && contents[0].role === 'model') {
            contents.shift();
        }

        const body = {
            contents,
            systemInstruction: { parts: [{ text: buildSystemPrompt(context) }] }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`;

        const response = await geminiFlashQueue.enqueue(async () => {
            return fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
                body: JSON.stringify(body)
            });
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini Flash API Error (${response.status}): ${errorText}`);
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
