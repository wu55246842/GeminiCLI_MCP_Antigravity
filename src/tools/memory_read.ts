import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export const memoryReadDef = {
    name: 'memory_read',
    description: 'Reads a specific memory file (like MEMORY.md or a daily log memory/YYYY-MM-DD.md) from the workspace to recall context.',
    inputSchema: {
        type: 'object',
        properties: {
            filename: {
                type: 'string',
                description: 'The exact filename to read. Use "MEMORY.md" for long-term memory, or "memory/YYYY-MM-DD.md" for a specific daily log.',
            }
        },
        required: ['filename'],
    },
};

export async function handleMemoryRead(args: any) {
    const { filename } = args;
    if (!filename) {
        throw new Error("Missing filename for memory_read");
    }

    // Security: ensure the file being read is strictly within the workspace
    const targetFile = path.resolve(config.WORKSPACE_ROOT, filename);
    if (!targetFile.startsWith(path.resolve(config.WORKSPACE_ROOT))) {
        throw new Error("Cannot read memory files outside of the workspace root.");
    }

    if (!fs.existsSync(targetFile)) {
        return {
            filename,
            content: "(No memory recorded yet.)"
        };
    }

    const content = fs.readFileSync(targetFile, 'utf8');

    return {
        filename,
        content
    };
}
