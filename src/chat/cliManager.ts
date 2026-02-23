import { spawn } from 'child_process';
import { config } from '../config';
import os from 'os';
import fs from 'fs';
import path from 'path';

const streamSubscribers: Set<(data: string) => void> = new Set();

// A simple regex to strip ANSI escape codes if strip-ansi is unavailable or async
const ansiRegex = new RegExp([
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
].join('|'), 'g');

export function initCliProcess() {
    // No-op for now. We spawn per request because the gemini CLI is easily controlled via --prompt.
    // We maintain this function signature so routes.ts doesn't break.
}

export function subscribeToStream(callback: (data: string) => void) {
    streamSubscribers.add(callback);
    return () => {
        streamSubscribers.delete(callback);
    };
}

export function sendToCli(message: string) {
    console.log(`[CLI Manager] Spawning new Gemini CLI process for message in ${config.WORKSPACE_ROOT}`);

    // Add a trailing instruction to force the CLI to respond with rich formatting and in the user's language,
    // AND to explicitly instruct it to use the new memory tools to emulate OpenClaw's memory architecture.
    const enhancedMessage = `${message}\n\n[SYSTEM: Please always reply in the same language as the user's message. Format your output with clear Markdown. CRITICAL MEMORY INSTRUCTION: You have access to 'memory_search' and 'memory_write' MCP tools. You MUST use 'memory_search' to recall past context if the user refers to past conversations. You MUST use 'memory_write' (type="long-term" for MEMORY.md, type="short-term" for daily logs) if the user tells you to remember something or makes a significant decision.]`;

    // Write the prompt to a temporary file to completely bypass shell quoting nightmares
    // especially with multiline strings and complex special characters.
    const tempPromptFile = path.join(os.tmpdir(), `gemini_prompt_${Date.now()}.txt`);
    fs.writeFileSync(tempPromptFile, enhancedMessage, 'utf8');

    // Read the file natively using PowerShell's Get-Content or Bash's cat and pipe it into the --prompt flag
    const commandLine = os.platform() === 'win32'
        ? `$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding; $env:NODE_OPTIONS="--no-warnings"; $promptText = Get-Content -Raw -Path "${tempPromptFile}"; gemini --prompt $promptText`
        : `NODE_OPTIONS="--no-warnings" gemini --prompt "$(cat ${tempPromptFile})"`;

    const geminiProcess = spawn(os.platform() === 'win32' ? 'powershell.exe' : 'bash', ['-Command', commandLine], {
        cwd: config.WORKSPACE_ROOT,
        env: process.env // Inherit env vars so gemini can find its config
    });

    // Force UTF-8 encoding to prevent Windows PowerShell from mangling output like Chinese characters
    geminiProcess.stdout.setEncoding('utf8');
    geminiProcess.stderr.setEncoding('utf8');

    // Cleanup the temp file when process exits
    const cleanup = () => {
        try { if (fs.existsSync(tempPromptFile)) fs.unlinkSync(tempPromptFile); } catch (e) { }
    };

    geminiProcess.stdout.on('data', (data) => {
        const text = data.toString();
        const cleanText = text.replace(ansiRegex, '');
        // Broadcast to all connected SSE clients
        for (const sub of streamSubscribers) {
            sub(cleanText);
        }
    });

    geminiProcess.stderr.on('data', (data) => {
        const text = data.toString();
        const cleanText = text.replace(ansiRegex, '');
        const trimmed = cleanText.trim();

        // Suppress the annoying punycode DeprecationWarning from third party libs
        // Also suppress "Loaded cached credentials" and "Tool execution denied by policy" that spam the UI
        if (!trimmed ||
            trimmed.includes('DeprecationWarning') ||
            trimmed.includes('punycode') ||
            trimmed.includes('Loaded cached credentials') ||
            trimmed.includes('Tool execution denied by policy')) {
            return;
        }

        console.error(`[CLI Manager STDERR]: ${trimmed}`);

        // Broadcast errors to stream so the user knows
        for (const sub of streamSubscribers) {
            sub(`\n[CLI ERROR]: ${trimmed}`);
        }
    });

    geminiProcess.on('exit', (code) => {
        cleanup();
        console.log(`[CLI Manager] Process exited with code ${code}`);
    });

    geminiProcess.on('error', (err) => {
        cleanup();
        console.error(`[CLI Manager] Process error:`, err);
    });
}
