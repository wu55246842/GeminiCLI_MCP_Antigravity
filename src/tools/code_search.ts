import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import { config } from '../config';
import { filterAllowedPaths } from '../security';

const execFileAsync = util.promisify(execFile);

export const codeSearchDef = {
    name: "code_search",
    description: "Search for code across the workspace.",
    inputSchema: {
        type: "object",
        properties: {
            query: { type: "string" },
            regex: { type: "boolean" },
            caseSensitive: { type: "boolean" },
            glob: { type: "array", items: { type: "string" } },
            maxResults: { type: "number", default: 200 }
        },
        required: ["query"]
    }
};

function exploreDir(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (!filterAllowedPaths([fullPath]).length) continue;
        if (entry.isDirectory()) exploreDir(fullPath, fileList);
        else fileList.push(fullPath);
    }
    return fileList;
}

function nodefsSearch(args: any, root: string) {
    const { query, regex = false, caseSensitive = false, maxResults = 200 } = args;
    const allFiles = exploreDir(root);
    const results: any[] = [];
    let truncated = false;

    const flags = caseSensitive ? 'g' : 'gi';
    // Escape for non-regex
    const patternStr = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(patternStr, flags);

    for (const file of allFiles) {
        if (results.length >= maxResults) {
            truncated = true;
            break;
        }

        try {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const lineText = lines[i];

                // Reset lastIndex
                pattern.lastIndex = 0;
                const match = pattern.exec(lineText);

                if (match) {
                    const col = match.index + 1;
                    const contextStartLine = Math.max(0, i - 2);
                    const contextEndLine = Math.min(lines.length - 1, i + 2);
                    const contextLines = lines.slice(contextStartLine, contextEndLine + 1);

                    results.push({
                        path: file,
                        line: i + 1,
                        column: col,
                        preview: lineText.trim(),
                        context: {
                            startLine: contextStartLine + 1,
                            endLine: contextEndLine + 1,
                            lines: contextLines
                        }
                    });

                    if (results.length >= maxResults) {
                        truncated = true;
                        break;
                    }
                }
            }
        } catch (e) {
            // Ignored inaccessible
        }
    }

    return { query, regex, caseSensitive, results, truncated };
}

export async function handleCodeSearch(args: any) {
    const root = path.resolve(config.WORKSPACE_ROOT);

    // Attempt with ripgrep if available
    const rgPath = config.RG_PATH || 'rg';
    try {
        const rgArgs = ['--json'];
        if (args.caseSensitive) rgArgs.push('-s');
        else rgArgs.push('-i');

        if (!args.regex) rgArgs.push('-F');

        // Convert ignored paths to multiple --glob '!pattern'
        config.IGNORED_DIRS.forEach(pattern => {
            rgArgs.push('-g', `!**/${pattern}/**`);
        });

        if (args.glob && args.glob.length > 0) {
            args.glob.forEach((g: string) => rgArgs.push('-g', g));
        }

        const maxResults = args.maxResults || 200;
        rgArgs.push(args.query);
        rgArgs.push(root);

        const { stdout } = await execFileAsync(rgPath, rgArgs, { maxBuffer: 10 * 1024 * 1024 }); // 10MB buf

        // Parse ripgrep output
        const lines = stdout.split('\n');
        const results: any[] = [];
        let truncated = false;

        for (const lineStr of lines) {
            if (!lineStr.trim()) continue;
            const parsed = JSON.parse(lineStr);
            if (parsed.type === 'match') {
                const m = parsed.data;
                const lineNum = m.line_number;
                const colNum = m.submatches.length ? m.submatches[0].start : 1;
                const absolutePath = m.path.text;

                if (!filterAllowedPaths([absolutePath]).length) continue;

                // Load original file for context
                let contextLines: string[] = [];
                let contextStartLine = lineNum;
                let contextEndLine = lineNum;
                try {
                    const content = fs.readFileSync(absolutePath, 'utf8').split('\n');
                    const i = lineNum - 1;
                    contextStartLine = Math.max(0, i - 2);
                    contextEndLine = Math.min(content.length - 1, i + 2);
                    contextLines = content.slice(contextStartLine, contextEndLine + 1);
                } catch (e) { }

                results.push({
                    path: absolutePath,
                    line: lineNum,
                    column: colNum,
                    preview: m.lines.text ? m.lines.text.trim() : '',
                    context: {
                        startLine: contextStartLine + 1,
                        endLine: contextEndLine + 1,
                        lines: contextLines
                    }
                });

                if (results.length >= maxResults) {
                    truncated = true;
                    break;
                }
            }
        }

        return { query: args.query, regex: args.regex, caseSensitive: args.caseSensitive, results, truncated };
    } catch (err: any) {
        if (err.code === 1) {
            // Ripgrep returned 1 meaning no matches found
            return { query: args.query, regex: args.regex, caseSensitive: args.caseSensitive, results: [], truncated: false };
        }
        // Fallback if ripgrep missing or failed for other reasons
        console.log(`Ripgrep search failed or not available (${err.message}), falling back to nodefs search.`);
        return nodefsSearch(args, root);
    }
}
