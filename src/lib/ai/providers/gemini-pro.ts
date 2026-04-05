import { getValidGoogleToken } from '@/lib/auth/google-oauth';
import type { AIProvider, ChatMessageData, MarketContext } from '@/types';
import { isRateLimitError } from '@/lib/api-queue';

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 3000;

export class GeminiProProvider implements AIProvider {
    name = "gemini-pro";
    requiresOAuth = true;

    async isAuthenticated(): Promise<boolean> {
        const token = await getValidGoogleToken();
        return !!token;
    }

    getModelName(): string {
        return "gemini-2.5-pro";
    }

    private buildSystemPrompt(context: MarketContext): string {
        return `You are a helpful AI Market Agent for CS2Vault, a Counter-Strike 2 portfolio and market analysis application.
You act as an expert investment advisor for the CS2 market.

Market Context:
- Top Gainers: ${JSON.stringify(context.topGainers)}
- Top Losers: ${JSON.stringify(context.topLosers)}
${context.portfolioSummary ? `- Portfolio Total Value: $${context.portfolioSummary.totalValue.toFixed(2)}\n- Portfolio PnL: $${context.portfolioSummary.unrealizedPnL.toFixed(2)}` : ''}
${context.inventory ? `- Full Inventory: ${JSON.stringify(context.inventory)}` : ''}
${context.targetedItemData ? `- Targeted Item History (30 Days): ${JSON.stringify(context.targetedItemData)}` : ''}

Answer the user's questions strictly about Counter-Strike 2 market data, items, and their portfolio. Use the provided context to provide specific hold/sell advice and investment recommendations when asked. 
If Targeted Item History is provided, confidently use this 30-day trajectory to identify trends, forecast growth, and provide timeframe-based projections. 
If the user asks about an item and you do NOT see it in the context, politely inform them: "I don't have localized DB tracking for this item yet. Please add it to your Watchlist so I can start charting its 30-day trajectory."
Be concise and formatted in markdown.`;
    }

    async *chat(messages: ChatMessageData[], context: MarketContext): AsyncGenerator<string> {
        const token = await getValidGoogleToken();
        if (!token) throw new Error("Not authenticated with Google.");

        // Filter out system messages as they are sent as systemInstruction
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
            systemInstruction: { parts: [{ text: this.buildSystemPrompt(context) }] }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse`;

        let response: Response | null = null;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });

                if (response.ok) {
                    lastError = null;
                    break;
                }

                const errorText = await response.text();
                const error = new Error(`Gemini Pro API Error (${response.status}): ${errorText}`);

                if (response.status === 429 && attempt < MAX_RETRIES) {
                    const retryAfter = response.headers.get('retry-after');
                    const backoffMs = retryAfter
                        ? parseInt(retryAfter, 10) * 1000
                        : BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
                    console.warn(
                        `[Gemini Pro] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}). ` +
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
                        `[Gemini Pro] Rate limit error (attempt ${attempt + 1}/${MAX_RETRIES}). ` +
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
            throw lastError ?? new Error("Gemini Pro API request failed after retries");
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
