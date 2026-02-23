import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export const memorySearchDef = {
    name: 'memory_search',
    description: 'Searches all memory files (MEMORY.md and daily logs) for a specific keyword or phrase to recall past context.',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The keyword or phrase to search for across all memory files.',
            }
        },
        required: ['query'],
    },
};

export async function handleMemorySearch(args: any) {
    const { query } = args;
    if (!query) {
        throw new Error("Missing query for memory_search");
    }

    const memoryDir = path.join(config.WORKSPACE_ROOT, 'memory');
    const longTermFile = path.join(config.WORKSPACE_ROOT, 'MEMORY.md');

    const results: Array<{ file: string, line: number, content: string }> = [];
    const searchRegex = new RegExp(query, 'i'); // Simple case-insensitive match

    const searchFile = (filePath: string) => {
        if (!fs.existsSync(filePath)) return;

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((lineText, index) => {
            if (searchRegex.test(lineText)) {
                // Return some surrounding context (1 line before and after if possible)
                const start = Math.max(0, index - 1);
                const end = Math.min(lines.length - 1, index + 1);
                const snippet = lines.slice(start, end + 1).join('\n').trim();

                results.push({
                    file: path.relative(config.WORKSPACE_ROOT, filePath),
                    line: index + 1,
                    content: snippet
                });
            }
        });
    };

    // 1. Search Long term
    searchFile(longTermFile);

    // 2. Search short term daily logs
    if (fs.existsSync(memoryDir)) {
        const files = fs.readdirSync(memoryDir);
        for (const file of files) {
            if (file.endsWith('.md')) {
                searchFile(path.join(memoryDir, file));
            }
        }
    }

    if (results.length === 0) {
        return {
            query,
            message: "No memory found matching the query."
        };
    }

    return {
        query,
        matches: results
    };
}
