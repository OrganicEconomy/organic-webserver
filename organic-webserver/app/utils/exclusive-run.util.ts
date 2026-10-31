let lastRun: Promise<unknown> = Promise.resolve()

export function runExclusively<T>(task: () => Promise<T>): Promise<T> {
    const run = lastRun.then(task)
    lastRun = run.catch(() => undefined)
    return run
}
