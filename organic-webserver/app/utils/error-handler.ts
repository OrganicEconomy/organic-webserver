import type { NextFunction, Request, Response } from 'express'
import { sendError } from './api-error.js'

export function errorHandler(err: { status?: number }, req: Request, res: Response, _next: NextFunction): void {
    if (isClientError(err)) {
        sendError(res, err.status, "Invalid request.")
        return
    }
    console.error(err)
    sendError(res, 500, "Internal server error.")
}

function isClientError(err: { status?: number }): err is { status: number } {
    return err.status !== undefined && err.status >= 400 && err.status < 500
}
