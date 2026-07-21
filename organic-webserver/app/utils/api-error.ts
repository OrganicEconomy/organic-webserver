import type { Response } from 'express'
import type { ApiError, ApiErrorCode } from 'organic-protocol'

/**
 * Every non-2xx response of the /api/v1 contract carries { error, code? }
 * (PROTOCOL.md §5). `code` is reserved for the enumerated ApiErrorCode
 * cases; plain validation errors (missing field, malformed input) omit it.
 */
export function sendError(res: Response, status: number, error: string, code?: ApiErrorCode): void {
    const body: ApiError = code ? { error, code } : { error }
    res.status(status).send(body)
}
