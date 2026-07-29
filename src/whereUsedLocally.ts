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

export interface LocalImageUsagePartition {
    referencedImagePaths: string[];
    unusedImagePaths: string[];
}

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
    return (await scanLocalImageUsage([imagePath], searchRoot)).matchingPaths;
}

export async function findDocumentsReferencingImages(
    imagePaths: readonly string[],
    searchRoot: string
): Promise<string[]> {
    return (await scanLocalImageUsage(imagePaths, searchRoot)).matchingPaths;
}

export async function partitionImagesByLocalUsage(
    imagePaths: readonly string[],
    searchRoot: string
): Promise<LocalImageUsagePartition> {
    const result = await scanLocalImageUsage(imagePaths, searchRoot);
    return {
        referencedImagePaths: result.images
            .filter(image => image.isReferenced)
            .map(image => image.imagePath),
        unusedImagePaths: result.images
            .filter(image => !image.isReferenced)
            .map(image => image.imagePath)
    };
}

interface ImageUsage {
    imagePath: string;
    ancestorKeys: Set<string>;
    isReferenced: boolean;
}

interface LocalImageUsageScan {
    images: ImageUsage[];
    matchingPaths: string[];
}

async function scanLocalImageUsage(
    imagePaths: readonly string[],
    searchRoot: string
): Promise<LocalImageUsageScan> {
    const absoluteSearchRoot = path.resolve(searchRoot);
    const absoluteImagePaths = [...new Map(imagePaths.map(imagePath => {
        const absoluteImagePath = path.resolve(imagePath);
        return [normalizeForComparison(absoluteImagePath), absoluteImagePath];
    })).values()].filter(imagePath =>
        isWithin(absoluteSearchRoot, path.dirname(imagePath))
    );
    if (absoluteImagePaths.length === 0) {
        return { images: [], matchingPaths: [] };
    }

    const images = absoluteImagePaths.map(imagePath => ({
        imagePath,
        ancestorKeys: new Set(
            ancestorsWithin(path.dirname(imagePath), absoluteSearchRoot)
                .map(normalizeForComparison)
        ),
        isReferenced: false
    }));
    const directories = [...new Map(images.flatMap(image =>
        ancestorsWithin(path.dirname(image.imagePath), absoluteSearchRoot)
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

        const directoryKey = normalizeForComparison(directory);
        const eligibleImages = images.filter(image => image.ancestorKeys.has(directoryKey));
        for (const candidatePath of candidatePaths) {
            try {
                const content = await fs.readFile(candidatePath, 'utf8');
                let documentMatched = false;
                for (const image of eligibleImages) {
                    if (markdownReferencesImage(content, candidatePath, image.imagePath)) {
                        image.isReferenced = true;
                        documentMatched = true;
                    }
                }
                if (documentMatched) {
                    matches.push(candidatePath);
                }
            } catch {
                // An unreadable document should not prevent the remaining ancestors being searched.
            }
        }
    }
    return { images, matchingPaths: matches };
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
