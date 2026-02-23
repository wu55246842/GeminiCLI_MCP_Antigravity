import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { filterAllowedPaths } from '../security';

export const repoListDef = {
    name: "repo_list",
    description: "Lists available repositories or workspaces in the root directory.",
    inputSchema: {
        type: "object",
        properties: {}
    }
};

export async function handleRepoList(args: any) {
    const root = path.resolve(config.WORKSPACE_ROOT);

    if (!fs.existsSync(root)) {
        throw new Error(`Workspace root does not exist: ${root}`);
    }

    const entries = fs.readdirSync(root, { withFileTypes: true });
    const allSubDirs = entries
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(root, dirent.name));

    // Filter paths explicitly
    const allowedDirs = filterAllowedPaths(allSubDirs);

    const workspaces = allowedDirs.map(dir => ({
        name: path.basename(dir),
        path: dir
    }));

    // Also verify root is allowed (should be)
    return {
        workspace_root: root,
        workspaces,
        ignored: config.IGNORED_DIRS
    };
}
