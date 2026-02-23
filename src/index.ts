import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { config } from "./config";
import { registerTools } from "./tools";
import { chatRouter } from "./chat/routes";
import path from "path";
import { initializeKeyPair } from "./security/crypto";

const app = express();

// Auto-generate or load RSA keys for Web UI pairing
initializeKeyPair();
function createServer() {
    const server = new Server({
        name: "GeminiCLI_MCP_Antigravity",
        version: "1.0.0"
    }, {
        capabilities: {
            tools: {}
        }
    });
    registerTools(server);
    return server;
}




let transport: SSEServerTransport | null = null;

// Allow cross-origin for CLI/browser clients possibly connecting to localhost
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Map of session IDs to Server instances and Transports
const sessions = new Map<string, { server: Server, transport: SSEServerTransport }>();

app.get("/sse", async (req, res) => {
    // Basic session ID logic
    const sessionId = Math.random().toString(36).substring(7);

    // SSEServerTransport normally responds to the client, telling it the POST endpoint is `/message?sessionId=xxx`
    const transport = new SSEServerTransport("/message/" + sessionId, res);

    const server = createServer();
    sessions.set(sessionId, { server, transport });

    await server.connect(transport);
    console.log(`SSE connection initialized: ${sessionId}`);

    // Clean up on disconnect
    res.on('close', () => {
        sessions.delete(sessionId);
        console.log(`SSE connection closed: ${sessionId}`);
    });
});

app.post("/message/:sessionId", async (req, res) => {
    const sessionId = req.params.sessionId;
    const session = sessions.get(sessionId);

    if (session && session.transport) {
        await session.transport.handlePostMessage(req, res);
    } else {
        res.status(400).send("No active connection for session");
    }
});

// === Web Chat Integration ===
app.use(express.static(path.join(__dirname, '../src/public')));
app.use('/api', chatRouter);

const PORT = config.PORT;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Listening on http://127.0.0.1:${PORT}`);
});
