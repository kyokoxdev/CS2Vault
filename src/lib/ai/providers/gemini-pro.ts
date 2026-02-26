import { getValidGoogleToken } from '@/lib/auth/google-oauth';
import type { AIProvider, ChatMessageData, MarketContext } from '@/types';

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

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Gemini Pro API Error: ${await response.text()}`);
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
                    } catch (e) {
                        // ignore parse errors for partial lines
                    }
                }
            }
        }
    }
}
