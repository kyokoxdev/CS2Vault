import OpenAI from 'openai';
import type { AIProvider, ChatMessageData, MarketContext } from '@/types';
import { prisma } from '@/lib/db';

export class OpenAIProvider implements AIProvider {
    name = "openai";
    requiresOAuth = false;
    private client: OpenAI | null = null; // Deprecated singleton fallback pattern

    constructor() {
        if (process.env.OPENAI_API_KEY) {
            this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
    }

    async isAuthenticated(): Promise<boolean> {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
        return !!(settings?.openAiApiKey || process.env.OPENAI_API_KEY);
    }

    getModelName(): string {
        return "gpt-3.5-turbo";
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
        const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
        const apiKey = settings?.openAiApiKey || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error("OpenAI API key not configured. Add it in Settings.");
        }

        const client = new OpenAI({ apiKey });

        const openAiMsgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: this.buildSystemPrompt(context) },
            ...messages.filter(m => m.role !== 'system').map(m => ({
                role: m.role,
                content: m.content
            } as OpenAI.Chat.ChatCompletionMessageParam))
        ];

        const stream = await client.chat.completions.create({
            model: this.getModelName(),
            messages: openAiMsgs,
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }
}
