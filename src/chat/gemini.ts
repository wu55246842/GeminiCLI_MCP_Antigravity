import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

let aiInstance: GoogleGenAI | null = null;

// Initialize conditionally so the MCP server won't crash if people don't use the web UI
export function getAI() {
    if (!aiInstance) {
        if (!config.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY is not configured in .env. It is required for the Web Chat interface.");
        }
        aiInstance = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    }
    return aiInstance;
}

export interface ChatMessage {
    role: 'user' | 'model';
    parts: Array<{
        text?: string;
        inlineData?: {
            data: string;
            mimeType: string;
        }
    }>;
}

export async function generateChatResponse(history: ChatMessage[], newMessage: ChatMessage['parts']) {
    const ai = getAI();

    // Convert history format if needed or use straight
    // GoogleGenAI expects a specific format
    const contents = history.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user', // genai sdk expects user or model
        parts: msg.parts
    }));

    contents.push({ role: 'user', parts: newMessage });

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
    });

    return response.text;
}
