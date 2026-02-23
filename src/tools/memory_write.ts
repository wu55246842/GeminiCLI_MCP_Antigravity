import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export const memoryWriteDef = {
    name: 'memory_write',
    description: 'Writes durable facts, user preferences, or important decisions to the workspace long-term MEMORY.md file, or short-term notes to the daily log.',
    inputSchema: {
        type: 'object',
        properties: {
            content: {
                type: 'string',
                description: 'The markdown content to write to memory. Be detailed and concise.',
            },
            type: {
                type: 'string',
                description: 'The type of memory. Use "long-term" for durable facts (MEMORY.md) and "short-term" for daily logging.',
                enum: ['long-term', 'short-term']
            }
        },
        required: ['content', 'type'],
    },
};

export async function handleMemoryWrite(args: any) {
    const { content, type } = args;
    if (!content || !type) {
        throw new Error("Missing content or type for memory_write");
    }

    const memoryDir = path.join(config.WORKSPACE_ROOT, 'memory');

    // Ensure memory directories exist
    if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
    }

    let targetFile = '';

    if (type === 'long-term') {
        targetFile = path.join(config.WORKSPACE_ROOT, 'MEMORY.md');
    } else {
        const today = new Date().toISOString().split('T')[0];
        targetFile = path.join(memoryDir, `${today}.md`);
    }

    const timestamp = new Date().toISOString();
    const entry = `\n## [${timestamp}]\n${content}\n`;

    fs.appendFileSync(targetFile, entry, 'utf8');

    return {
        success: true,
        message: `Successfully wrote ${type} memory to ${targetFile}`,
        file: targetFile,
    };
}
