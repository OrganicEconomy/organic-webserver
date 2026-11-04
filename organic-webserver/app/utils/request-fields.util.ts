export function hasTextFields(body: unknown, fields: string[]): boolean {
    return typeof body === 'object' && body !== null
        && fields.every(field => isNonEmptyText((body as Record<string, unknown>)[field]))
}

function isNonEmptyText(value: unknown): boolean {
    return typeof value === 'string' && value.length > 0
}

export function findTooLongField(body: Record<string, string>, maxLengths: Record<string, number>): string | undefined {
    return Object.keys(maxLengths).find(field => body[field].length > maxLengths[field])
}
