import path from 'path';
import ignore from 'ignore';
import { config } from '../config';

const ig = ignore().add(config.IGNORED_DIRS);

export function isPathAllowed(targetPath: string): boolean {
    const absoluteRoot = path.resolve(config.WORKSPACE_ROOT);
    const absoluteTarget = path.resolve(targetPath);

    // Must be inside workspace root
    if (!absoluteTarget.startsWith(absoluteRoot)) {
        return false;
    }

    const relativePath = path.relative(absoluteRoot, absoluteTarget);

    // Root itself is allowed
    if (relativePath === '') {
        return true;
    }

    // Use POSIX path separators for ignore matches
    const posixPath = relativePath.split(path.sep).join('/');

    if (ig.ignores(posixPath)) {
        return false;
    }

    return true;
}

export function validatePathOrThrow(targetPath: string) {
    if (!isPathAllowed(targetPath)) {
        throw new Error(`Path access denied: ${targetPath}`);
    }
}

export function filterAllowedPaths(paths: string[]): string[] {
    return paths.filter(isPathAllowed);
}
