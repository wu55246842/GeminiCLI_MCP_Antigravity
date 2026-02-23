export const buildInvestigationReportDef = {
    name: "build_investigation_report",
    description: "Generate an investigation report skeleton based on incident information.",
    inputSchema: {
        type: "object",
        properties: {
            incidentTitle: { type: "string" },
            environment: { type: "string" },
            services: { type: "array", items: { type: "string" } },
            timeWindow: {
                type: "object",
                properties: { start: { type: "string" }, end: { type: "string" } }
            },
            traceIds: { type: "array", items: { type: "string" } },
            errorCodes: { type: "array", items: { type: "string" } },
            logSnippets: { type: "array", items: { type: "string" } }
        },
        required: ["incidentTitle"]
    }
};

export async function handleBuildInvestigationReport(args: any) {
    const { incidentTitle, environment = 'Unknown', services = [], timeWindow = {}, traceIds = [], errorCodes = [], logSnippets = [] } = args;

    const markdown = `# Investigation Report
## Incident: ${incidentTitle}
**Environment**: ${environment}
**Time Window**: ${timeWindow.start || 'N/A'} - ${timeWindow.end || 'N/A'}
**Associated Services**: ${services.length ? services.join(', ') : 'N/A'}

### Impacted Entities
- Trace IDs: ${traceIds.length ? traceIds.join(', ') : 'None provided'}
- Error Codes: ${errorCodes.length ? errorCodes.join(', ') : 'None provided'}

### Provided Evidence
${logSnippets.length ? logSnippets.map((snippet: string) => `\`\`\`\n${snippet}\n\`\`\``).join('\n') : '*No log snippets provided.*'}

---
### Next Steps & Required Evidence
1. **Search Code for Error Codes**: Use \`code_search\` tool looking for the specified error codes (${errorCodes.join(', ')}).
2. **Review Logs**: If logs provide stacktraces, use \`code_search\` or \`file_read\` to inspect lines showing failure components.
3. **Trace API Endpoints**: Utilize \`symbol_hint\` to match incoming endpoint URLs to source code functions/controllers.
4. **Determine Root Cause**: Read implementation around error injection sites using \`file_read\` context capability.

### Findings
*(This area to be populated incrementally by reasoning model during investigation...)*
`;

    return { markdown };
}
