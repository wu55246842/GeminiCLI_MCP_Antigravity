import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

export const dbSchemaSearchDef = {
    name: 'db_schema_search',
    description: 'Search for a database table schema in the iBorder PowerDesigner HTML documentation.',
    inputSchema: {
        type: 'object',
        properties: {
            keyword: {
                type: 'string',
                description: 'Table name or keyword to search for (e.g. TB_IBMA_IVH_BL_VEH_RQ)'
            }
        },
        required: ['keyword']
    }
};

export async function handleDbSchemaSearch(args: any) {
    const keyword = args.keyword;
    if (!keyword) throw new Error("keyword is required");

    // We assume the documents are statically located based on WORKSPACE_ROOT
    const baseDir = process.env.WORKSPACE_ROOT || process.cwd();
    const docPath = path.join(baseDir, 'ibdoc_design/03 Database Design/iBorder_20230515/Content');

    if (!fs.existsSync(docPath)) {
        return { error: `Documentation directory not found: ${docPath}` };
    }

    const rgPath = process.env.RG_PATH || 'rg';
    let matches: string[] = [];

    try {
        const safeKeyword = keyword.replace(/"/g, '\\"');
        // Find matching Tbl_*.htm files avoiding the Attr files
        const cmd = `"${rgPath}" -l -i "${safeKeyword}" "${docPath}" -g "Tbl_*.htm" -g "!*_Attr.htm"`;
        const output = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        matches = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    } catch (e: any) {
        return { error: `No tables found matching keyword: ${keyword}` };
    }

    if (matches.length === 0) {
        return { error: `No tables found matching keyword: ${keyword}` };
    }

    const maxMatches = 3;
    let markdownOutput = "";

    for (let i = 0; i < Math.min(matches.length, maxMatches); i++) {
        const filePath = matches[i];
        const html = fs.readFileSync(filePath, 'utf-8');
        const $ = cheerio.load(html);

        const title = $('title').text().trim();
        markdownOutput += `### Table: ${title}\n\n`;

        let columnsTable: any = null;
        $('table').each((_, table) => {
            const firstRowText = $(table).find('tr:first-child').text();
            if (firstRowText.includes('ColumnName') && firstRowText.includes('Datatype')) {
                columnsTable = table;
            }
        });

        if (columnsTable) {
            markdownOutput += `| Column Name | Datatype | Nullable | Definition |\n`;
            markdownOutput += `|---|---|---|---|\n`;

            $(columnsTable).find('tr').each((idx, tr) => {
                if (idx === 0) return; // skip header row

                const tds = $(tr).find('td');
                if (tds.length >= 5) {
                    const colName = $(tds[0]).text().replace(/\s+/g, ' ').trim();
                    const dataType = $(tds[2]).text().replace(/\s+/g, ' ').trim();
                    const isNull = $(tds[3]).text().replace(/\s+/g, ' ').trim();
                    const def = $(tds[4]).text().replace(/\s+/g, ' ').trim();

                    markdownOutput += `| ${colName} | ${dataType} | ${isNull} | ${def} |\n`;
                }
            });
        } else {
            markdownOutput += `*Column details could not be extracted from HTML.*\n`;
        }

        markdownOutput += "\n---\n\n";
    }

    if (matches.length > maxMatches) {
        markdownOutput += `\n*Note: Found ${matches.length} matches, showing top ${maxMatches}. Please refine your search if your table is not listed.*\n`;
    }

    return { results: markdownOutput };
}
