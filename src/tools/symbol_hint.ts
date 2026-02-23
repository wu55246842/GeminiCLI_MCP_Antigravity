import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { filterAllowedPaths } from '../security';

export const symbolHintDef = {
    name: "symbol_hint",
    description: "Extract symbol hints from code files.",
    inputSchema: {
        type: "object",
        properties: {
            query: { type: "string", description: "Optional filter string." },
            maxResults: { type: "number", description: "Max results to return." }
        }
    }
};

function exploreDir(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        // Explicitly check if path is allowed
        if (!filterAllowedPaths([fullPath]).length) continue;

        if (entry.isDirectory()) {
            exploreDir(fullPath, fileList);
        } else {
            if (['.ts', '.js', '.py', '.java'].includes(path.extname(fullPath))) {
                fileList.push(fullPath);
            }
        }
    }
    return fileList;
}

export async function handleSymbolHint(args: any) {
    const { query, maxResults = 100 } = args;
    const root = path.resolve(config.WORKSPACE_ROOT);

    const allFiles = exploreDir(root);
    const hints: any[] = [];

    for (const file of allFiles) {
        if (hints.length >= maxResults) break;

        try {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                if (hints.length >= maxResults) break;
                const lineText = lines[i];

                const rules = [
                    { kind: "class/interface", regex: /(?:class|interface)\s+([A-Za-z0-9_]+)/g },
                    { kind: "function", regex: /(?:function|def)\s+([A-Za-z0-9_]+)/g },
                    { kind: "endpoint", regex: /(?:@GetMapping|@PostMapping|@RequestMapping|app\.(?:get|post|put|delete))\s*\(\s*['"]([^'"]+)['"]/g }
                ];

                for (const rule of rules) {
                    let match;
                    while ((match = rule.regex.exec(lineText)) !== null) {
                        const name = match[1];
                        if (!query || name.toLowerCase().includes(query.toLowerCase())) {
                            hints.push({
                                kind: rule.kind,
                                name: name,
                                path: file,
                                line: i + 1,
                                preview: lineText.trim()
                            });
                            if (hints.length >= maxResults) break;
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore read errors for inaccessible files
        }
    }

    return { hints };
}
