import { Router } from 'express';
import multer from 'multer';
import { generateChatResponse, ChatMessage } from './gemini';
import { sendToCli, subscribeToStream, initCliProcess } from './cliManager';
import { verifyDigitalSignature } from '../security/crypto';

const upload = multer({ storage: multer.memoryStorage() });
export const chatRouter = Router();

chatRouter.post('/chat', verifyDigitalSignature, upload.array('files'), async (req, res) => {
    try {
        const text = req.body.text || "";
        const engine = req.body.engine || "api"; // 'api' or 'cli'
        const historyJson = req.body.history || "[]";
        let history: ChatMessage[] = [];

        try {
            history = JSON.parse(historyJson);
        } catch (e) {
            console.warn("Invalid history JSON:", historyJson);
        }

        const files = req.files as Express.Multer.File[];

        const newParts: any[] = [];
        if (text) {
            newParts.push({ text });
        }

        if (files && files.length > 0) {
            for (const file of files) {
                newParts.push({
                    inlineData: {
                        data: file.buffer.toString('base64'),
                        mimeType: file.mimetype
                    }
                });
            }
        }

        if (newParts.length === 0) {
            return res.status(400).json({ error: "Empty message" });
        }

        if (engine === 'cli') {
            // Send to locally spawned CLI process
            if (!text) {
                return res.status(400).json({ error: "CLI mode requires text input." });
            }
            sendToCli(text);
            return res.json({ success: true, mode: 'cli', message: "Sent to CLI. Awaiting stream." });
        } else {
            // Legacy API Route
            const replyText = await generateChatResponse(history, newParts);
            res.json({ text: replyText });
        }
    } catch (e: any) {
        console.error("Chat API Error:", e);
        res.status(500).json({ error: e.message || "Failed to generate chat response" });
    }
});

// SSE Stream for CLI output
chatRouter.get('/chat/stream', verifyDigitalSignature, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Make sure process is up if they connect
    initCliProcess();

    const unsubscribe = subscribeToStream((data) => {
        // Send data as SSE format: "data: ...\n\n"
        res.write(`data: ${JSON.stringify({ text: data })}\n\n`);
    });

    // Cleanup on disconnect
    req.on('close', () => {
        unsubscribe();
    });
});

