import { REQUEST_AUTH_TOLERANCE_SECONDS } from 'organic-protocol'

const REMEMBER_MS = 2 * REQUEST_AUTH_TOLERANCE_SECONDS * 1000

const forgetAt = new Map<string, number>()

export function isFirstUse(requestHash: string): boolean {
    forgetExpired()
    if (forgetAt.has(requestHash)) {
        return false
    }
    forgetAt.set(requestHash, Date.now() + REMEMBER_MS)
    return true
}

function forgetExpired(): void {
    const now = Date.now()
    for (const [requestHash, expiry] of forgetAt) {
        if (expiry > now) {
            return
        }
        forgetAt.delete(requestHash)
    }
}
