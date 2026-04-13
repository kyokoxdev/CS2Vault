import OpenAI from 'openai';
import type { AIProvider, ChatMessageData, MarketContext } from '@/types';
import { prisma } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { decryptApiKey } from '@/lib/auth/api-keys';

export class OpenAIProvider implements AIProvider {
    name = "openai";
    requiresOAuth = false;

    async isAuthenticated(): Promise<boolean> {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
        return !!(decryptApiKey(settings?.openAiApiKey) || process.env.OPENAI_API_KEY);
    }

    getModelName(): string {
        return "gpt-3.5-turbo";
    }

    async *chat(messages: ChatMessageData[], context: MarketContext): AsyncGenerator<string> {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
        const apiKey = decryptApiKey(settings?.openAiApiKey) || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error("OpenAI API key not configured. Add it in Settings.");
        }

        const hasImage = messages.some(m => m.imageBase64);
        if (hasImage) {
            yield "*Note: Image analysis is not supported by GPT-3.5 Turbo. Your image was not processed. Switch to a Gemini model for image support.*\n\n";
        }

        const client = new OpenAI({ apiKey });

        const openAiMsgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: buildSystemPrompt(context) },
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
