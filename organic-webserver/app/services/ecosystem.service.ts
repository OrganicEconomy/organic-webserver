import { EcosystemBlockchain } from 'organic-money/src/index.js'
import { Ecosystem } from '../models.js'
import { encryptEcosystemKey } from '../utils/ecosystem-key.util.js'
import { haversineDistanceKm } from '../utils/geo.util.js'
import type { EcosystemListEntry, MyEcosystemEntry } from 'organic-protocol'

/**
 * Creation is free and self-validating (Phase-2.md §0.3/§2.2): the server
 * generates the ecosystem's own key, self-signs its birth block, and
 * self-validates with that same key — no admin approval, no separate
 * referent. founderPk is recorded as validatorpk for attribution only, not
 * as the chain's cryptographic referent. The very first ecosystem ever
 * created on this server (whether via bootstrap registration or this
 * function called directly) automatically becomes the core.
 */
export async function createEcosystem(
    founderPk: string,
    name: string,
    description: string | null = null,
    lat: number | null = null,
    lng: number | null = null,
) {
    const eco = new EcosystemBlockchain()
    const ecoSk = eco.makeBirthBlock(null, founderPk, name)
    eco.validateAccount(ecoSk)

    const iscore = (await Ecosystem.count({ where: { iscore: true } })) === 0

    return await Ecosystem.create({
        publickey: eco.getMyPublicKey(),
        name,
        blocks: eco.export(),
        ecosk: await encryptEcosystemKey(ecoSk),
        iscore,
        lat,
        lng,
        description,
        validatorpk: founderPk,
    })
}

/** Whether publickey is currently an admin of the ecosystem at that pk. */
export async function isAdminOf(ecosystemPk: string, publickey: string): Promise<boolean> {
    const row = await Ecosystem.findOne({ where: { publickey: ecosystemPk } }) as any
    if (!row) return false
    return new EcosystemBlockchain(row.blocks).isAdmin(publickey)
}

/**
 * Directory listing (public — no secrets involved). Sorted and optionally
 * filtered by distance when lat/lng are given; unsorted otherwise.
 */
export async function listEcosystems(lat?: number, lng?: number, radiusKm?: number): Promise<EcosystemListEntry[]> {
    const rows = await Ecosystem.findAll() as any[]
    let entries: EcosystemListEntry[] = rows.map((r) => ({
        publickey: r.publickey,
        name: r.name,
        description: r.description,
        lat: r.lat,
        lng: r.lng,
        iscore: r.iscore,
    }))

    if (lat !== undefined && lng !== undefined) {
        entries = entries
            .map((e) => ({
                ...e,
                distanceKm: (e.lat !== null && e.lng !== null) ? haversineDistanceKm(lat, lng, e.lat, e.lng) : undefined,
            }))
            .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
        if (radiusKm !== undefined) {
            entries = entries.filter((e) => e.distanceKm !== undefined && e.distanceKm <= radiusKm)
        }
    }

    return entries
}

/**
 * Roles are re-carried onto every new block (organic-money's
 * EcosystemBlockchain), so only each ecosystem's current last block needs
 * checking — no full-chain replay. Public (§5 of Phase-2.md): membership is
 * already derivable by anyone from each ecosystem's own public chain, this
 * just saves the client from querying every ecosystem on the server one by one.
 */
export async function findMyEcosystems(publickey: string): Promise<MyEcosystemEntry[]> {
    const rows = await Ecosystem.findAll() as any[]
    const result: MyEcosystemEntry[] = []
    for (const row of rows) {
        const eco = new EcosystemBlockchain(row.blocks)
        if (eco.isAdmin(publickey)) result.push({ publickey: row.publickey, name: row.name, role: 'admin' })
        else if (eco.isPayer(publickey)) result.push({ publickey: row.publickey, name: row.name, role: 'payer' })
        else if (eco.isActor(publickey)) result.push({ publickey: row.publickey, name: row.name, role: 'actor' })
    }
    return result
}
