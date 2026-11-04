import type { Request, Response } from 'express'

let lastRun: Promise<unknown> = Promise.resolve()

export function runExclusively<T>(task: () => Promise<T>): Promise<T> {
    const run = lastRun.then(task)
    lastRun = run.catch(() => undefined)
    return run
}

export function exclusively(handler: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response): Promise<void> => runExclusively(() => handler(req, res))
}
