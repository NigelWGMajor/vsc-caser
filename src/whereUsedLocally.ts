import { promises as fs } from 'fs';
import * as path from 'path';
import { markdownReferencesImage } from './imageNesting';

const imageExtensions = new Set([
    '.avif',
    '.bmp',
    '.gif',
    '.heic',
    '.heif',
    '.ico',
    '.jpeg',
    '.jpg',
    '.png',
    '.svg',
    '.tif',
    '.tiff',
    '.webp'
]);

const markdownExtensions = new Set([
    '.markdown',
    '.md',
    '.mdown',
    '.mdx',
    '.mkd'
]);

export function isImageFilePath(filePath: string): boolean {
    return imageExtensions.has(path.extname(filePath).toLocaleLowerCase());
}

export function formatWhereUsedMessage(
    imagePath: string | readonly string[],
    matchingPaths: string[],
    workspaceRoot: string
): string {
    const imagePaths = typeof imagePath === 'string' ? [imagePath] : imagePath;
    const relativePaths = matchingPaths.map(matchingPath =>
        path.relative(workspaceRoot, matchingPath).replace(/\\/g, '/')
    );
    const noun = matchingPaths.length === 1 ? 'Markdown file' : 'Markdown files';
    const subject = imagePaths.length === 1
        ? `${path.basename(imagePaths[0])} is`
        : `${imagePaths.length} images are`;
    return `${subject} used by ${matchingPaths.length} ${noun}: `
        + relativePaths.join(', ');
}

export async function findDocumentsReferencingImage(
    imagePath: string,
    searchRoot: string
): Promise<string[]> {
    return findDocumentsReferencingImages([imagePath], searchRoot);
}

export async function findDocumentsReferencingImages(
    imagePaths: readonly string[],
    searchRoot: string
): Promise<string[]> {
    const absoluteSearchRoot = path.resolve(searchRoot);
    const absoluteImagePaths = [...new Map(imagePaths.map(imagePath => {
        const absoluteImagePath = path.resolve(imagePath);
        return [normalizeForComparison(absoluteImagePath), absoluteImagePath];
    })).values()].filter(imagePath =>
        isWithin(absoluteSearchRoot, path.dirname(imagePath))
    );
    if (absoluteImagePaths.length === 0) {
        return [];
    }

    const directories = [...new Map(absoluteImagePaths.flatMap(imagePath =>
        ancestorsWithin(path.dirname(imagePath), absoluteSearchRoot)
            .map(directory => [normalizeForComparison(directory), directory] as const)
    )).values()];
    const matches: string[] = [];
    for (const directory of directories) {
        let entries;
        try {
            entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }

        const candidatePaths = entries
            .filter(entry =>
                entry.isFile()
                && markdownExtensions.has(path.extname(entry.name).toLocaleLowerCase())
            )
            .map(entry => path.join(directory, entry.name))
            .sort((left, right) => left.localeCompare(right));

        for (const candidatePath of candidatePaths) {
            try {
                const content = await fs.readFile(candidatePath, 'utf8');
                if (absoluteImagePaths.some(imagePath =>
                    markdownReferencesImage(content, candidatePath, imagePath)
                )) {
                    matches.push(candidatePath);
                }
            } catch {
                // An unreadable document should not prevent the remaining ancestors being searched.
            }
        }
    }
    return matches;
}

function ancestorsWithin(start: string, searchRoot: string): string[] {
    const ancestors: string[] = [];
    let current = path.resolve(start);

    while (isWithin(searchRoot, current)) {
        ancestors.push(current);
        if (samePath(current, searchRoot)) {
            break;
        }
        const parent = path.dirname(current);
        if (samePath(parent, current)) {
            break;
        }
        current = parent;
    }
    return ancestors;
}

function isWithin(parent: string, candidate: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === ''
        || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
    return normalizeForComparison(left) === normalizeForComparison(right);
}

function normalizeForComparison(filePath: string): string {
    const normalized = path.resolve(filePath);
    return process.platform === 'win32' ? normalized.toLocaleLowerCase() : normalized;
}
