import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { validatePathOrThrow } from '../security';

export const fileReadDef = {
    name: "file_read",
    description: "Reads lines from a file.",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string", description: "Path to the file to read. Can be relative to WORKSPACE_ROOT or absolute." },
            startLine: { type: "number", description: "1-indexed start line." },
            endLine: { type: "number", description: "1-indexed end line (inclusive)." },
            maxLines: { type: "number", description: "Maximum number of lines to return." }
        },
        required: ["path"]
    }
};

export async function handleFileRead(args: any) {
    let { path: reqPath, startLine, endLine, maxLines = 200 } = args;

    const absolutePath = path.resolve(config.WORKSPACE_ROOT, reqPath);
    validatePathOrThrow(absolutePath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    const allLines = content.split('\n');

    let startIdx = startLine ? Math.max(0, startLine - 1) : 0;
    let endIdx = endLine ? Math.min(allLines.length - 1, endLine - 1) : Math.min(allLines.length - 1, startIdx + maxLines - 1);

    let truncated = false;

    if (endIdx - startIdx + 1 > maxLines) {
        endIdx = startIdx + maxLines - 1;
        truncated = true;
    }

    const lines = [];
    for (let i = startIdx; i <= endIdx; i++) {
        lines.push({
            line: i + 1,
            text: allLines[i]
        });
    }

    return {
        path: absolutePath,
        startLine: startIdx + 1,
        endLine: endIdx + 1,
        lines,
        truncated
    };
}
