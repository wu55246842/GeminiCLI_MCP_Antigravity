import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logAudit } from '../audit';
import { repoListDef, handleRepoList } from './repo_list';
import { codeSearchDef, handleCodeSearch } from './code_search';
import { fileReadDef, handleFileRead } from './file_read';
import { symbolHintDef, handleSymbolHint } from './symbol_hint';
import { buildInvestigationReportDef, handleBuildInvestigationReport } from './build_investigation_report';

import { memoryWriteDef, handleMemoryWrite } from './memory_write';
import { memoryReadDef, handleMemoryRead } from './memory_read';
import { memorySearchDef, handleMemorySearch } from './memory_search';
import { dbSchemaSearchDef, handleDbSchemaSearch } from './db_schema_search';

export function registerTools(server: Server) {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                repoListDef,
                codeSearchDef,
                fileReadDef,
                symbolHintDef,
                buildInvestigationReportDef,
                memoryWriteDef,
                memoryReadDef,
                memorySearchDef,
                dbSchemaSearchDef
            ]
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        let result: any;

        try {
            switch (name) {
                case 'repo_list':
                    result = await handleRepoList(args);
                    break;
                case 'code_search':
                    result = await handleCodeSearch(args);
                    break;
                case 'file_read':
                    result = await handleFileRead(args);
                    break;
                case 'symbol_hint':
                    result = await handleSymbolHint(args);
                    break;
                case 'build_investigation_report':
                    result = await handleBuildInvestigationReport(args);
                    break;
                case 'memory_write':
                    result = await handleMemoryWrite(args);
                    break;
                case 'memory_read':
                    result = await handleMemoryRead(args);
                    break;
                case 'memory_search':
                    result = await handleMemorySearch(args);
                    break;
                case 'db_schema_search':
                    result = await handleDbSchemaSearch(args);
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }

            let resultCount = 1;
            if (result && Array.isArray(result.results)) resultCount = result.results.length;
            else if (result && Array.isArray(result.workspaces)) resultCount = result.workspaces.length;
            else if (result && Array.isArray(result.lines)) resultCount = result.lines.length;
            else if (result && Array.isArray(result.hints)) resultCount = result.hints.length;

            logAudit(name, args, resultCount);

            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            };

        } catch (e: any) {
            logAudit(name, { ...args, error: e.message }, 0);
            return {
                content: [{ type: 'text', text: `Error: ${e.message}` }],
                isError: true
            };
        }
    });
}
