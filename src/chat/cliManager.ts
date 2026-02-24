import { config } from '../config';
import os from 'os';
import { spawn } from 'child_process';

type StreamSubscriber = (data: string) => void;

const streamSubscribers: Set<StreamSubscriber> = new Set();

const EOL = os.platform() === 'win32' ? '\r\n' : '\n';

// Optional: simple in-process queue to prevent concurrent gemini runs
// (Gemini CLI can run concurrently, but output may interleave and confuse your frontend)
let running = false;
const queue: Array<{ message: string }> = [];

export function initCliProcess() {
    // No persistent process needed in -p mode.
    // Keep as no-op to satisfy existing imports/calls.
}

/**
 * Subscribe to streamed output (SSE fanout).
 * Returns an unsubscribe function.
 */
export function subscribeToStream(callback: StreamSubscriber) {
    streamSubscribers.add(callback);
    return () => streamSubscribers.delete(callback);
}

function broadcast(text: string) {
    for (const sub of streamSubscribers) sub(text);
}

function runOne(message: string) {
    running = true;

    const prompt = sanitizePrompt(message);
    console.log('[CLI Manager] Prompt -> gemini -p:', prompt);

    const args = [
        '-p', prompt,
        '-o', 'stream-json',
        '--approval-mode', 'default',
        '--allowed-tools', 'code_search',
        '--allowed-tools', 'file_read',
    ];

    const child = spawn('gemini', args, {
        cwd: config.WORKSPACE_ROOT,
        env: {
            ...process.env,
            NODE_OPTIONS: process.env.NODE_OPTIONS || '--no-warnings',
        },
        shell: os.platform() === 'win32',
        windowsHide: true,
    });

    let buf = '';

    child.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');

        // stream-json 通常是一行一个 JSON
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);

            if (!line) continue;

            try {
                const evt = JSON.parse(line);

                // 只把 assistant 的文本增量转发到前端
                if (evt?.type === 'message' && evt?.role === 'assistant' && typeof evt?.content === 'string') {
                    broadcast(evt.content);
                }

                // 如果你想在前端也知道完成/失败，可以转发 result
                // if (evt?.type === 'result') broadcast(`\n[done:${evt.status}]\n`);
            } catch {
                // 遇到非 JSON 行就忽略或转发（一般不会）
                // broadcast(line);
            }
        }
    });


    child.on('exit', (code, signal) => {
        console.log(`[CLI Manager] Gemini exited code=${code} signal=${signal}`);
        running = false;
        const next = queue.shift();
        if (next) runOne(next.message);
    });

    child.on('error', (err) => {
        console.error('[CLI Manager] Gemini spawn error:', err);
        running = false;
        const next = queue.shift();
        if (next) runOne(next.message);
    });
}

/**
 * Send a prompt to Gemini (headless one-shot).
 * We queue requests to avoid interleaved output across multiple HTTP clients.
 */
function sanitizePrompt(s: string) {
    return s.replace(/\r?\n/g, ' ').trim();
}



export function sendToCli(message: string) {
    if (running) { queue.push({ message }); return; }
    runOne(message); // ✅ 不要 + EOL
}