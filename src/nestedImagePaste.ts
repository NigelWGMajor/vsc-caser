import * as path from 'path';

const imageExtensionsByMimeType: Record<string, string> = {
    'image/avif': '.avif',
    'image/bmp': '.bmp',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/tiff': '.tiff',
    'image/webp': '.webp'
};

const supportedImageExtensions = new Set(Object.values(imageExtensionsByMimeType));

export function normalizeImageTitle(text: string): string {
    return text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function toLowerKebabFileStem(text: string): string {
    return text
        .normalize('NFKD')
        .replace(/\p{Mark}/gu, '')
        .replace(/([\p{Lowercase_Letter}\p{Number}])(\p{Uppercase_Letter})/gu, '$1-$2')
        .toLocaleLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
}

export function getClipboardImageExtension(mimeType: string, sourceName: string): string | undefined {
    const mimeExtension = imageExtensionsByMimeType[mimeType.toLocaleLowerCase()];
    if (mimeExtension) {
        return mimeExtension;
    }

    const sourceExtension = path.extname(sourceName).toLocaleLowerCase();
    return supportedImageExtensions.has(sourceExtension) ? sourceExtension : undefined;
}

export function getFallbackImageTitle(sourceName: string): string {
    const extension = path.extname(sourceName);
    return normalizeImageTitle(path.basename(sourceName, extension)) || 'image';
}

export function formatNestedImageMarkdown(title: string, fileName: string): string {
    const escapedTitle = normalizeImageTitle(title)
        .replace(/\\/g, '\\\\')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
    return `![${escapedTitle}](image/${encodeURIComponent(fileName)})`;
}
