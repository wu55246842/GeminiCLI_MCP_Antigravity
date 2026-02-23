import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const auditLogPath = path.join(dataDir, 'audit.log');

export function logAudit(toolName: string, params: any, resultCount: number) {
    const entry = {
        timestamp: new Date().toISOString(),
        tool: toolName,
        params,
        resultCount
    };

    fs.appendFile(auditLogPath, JSON.stringify(entry) + '\n', (err) => {
        if (err) {
            console.error('Failed to write audit log:', err);
        }
    });
}
