import { CitizenBlockchain, EcosystemBlockchain } from 'organic-money/src/index.js'
import type { BlockWire } from 'organic-protocol'
import { Ecosystem } from '../models.js'

/** Whether publickey is currently an admin of this server's core ecosystem. */
export async function isCoreAdmin(publickey: string): Promise<boolean> {
    const core = await Ecosystem.findOne({ where: { iscore: true } }) as any
    if (!core) return false
    const eco = new EcosystemBlockchain(core.blocks)
    return eco.isAdmin(publickey)
}

/**
 * Combines the candidate's stored (BirthBlock-only) chain with the admin's
 * newly submitted InitializationBlock, and confirms the result is a fully
 * valid, validated chain. Returns null instead of throwing — the caller
 * turns that into a 400.
 */
export function mergeValidationBlock(candidateBlocks: BlockWire[], newBlock: BlockWire): BlockWire[] | null {
    try {
        const bc = new CitizenBlockchain([newBlock, ...candidateBlocks])
        bc.assertIsValid()
        if (!bc.isValidated()) return null
        return bc.export()
    } catch {
        return null
    }
}
