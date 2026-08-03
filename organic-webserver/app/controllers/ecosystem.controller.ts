import type { Request, Response } from 'express'
import { Ecosystem, User } from '../models.js'
import { sendError } from '../utils/api-error.js'
import { createEcosystem, isAdminOf, listEcosystems, findMyEcosystems } from '../services/ecosystem.service.js'
import type { EcosystemCreateResponse, EcosystemInfoResponse } from 'organic-protocol'

/** POST /ecosystems — timestamp-auth as the founding citizen (see EcosystemCreateBody). */
export async function postCreateEcosystem(req: Request, res: Response): Promise<void> {
    const founderPk = req.body?.publickey
    const name = req.body?.name
    if (!founderPk || !name) {
        sendError(res, 400, "Fields 'founderPk' and 'name' are needed.")
        return
    }

    const founder = await User.findOne({ where: { publickey: founderPk } }) as any
    if (!founder || founder.status !== 'active') {
        sendError(res, 403, "Founder must be an active citizen", 'UNKNOWN_USER')
        return
    }

    const eco = await createEcosystem(
        founderPk,
        name,
        req.body.description ?? null,
        req.body.lat ?? null,
        req.body.lng ?? null,
    ) as any

    const response: EcosystemCreateResponse = { publickey: eco.publickey, blocks: eco.blocks, iscore: eco.iscore }
    res.send(response)
}

/** GET /ecosystems?lat&lng&radiusKm — public directory. */
export async function getEcosystemList(req: Request, res: Response): Promise<void> {
    const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined
    const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined
    const radiusKm = req.query.radiusKm !== undefined ? Number(req.query.radiusKm) : undefined
    res.send(await listEcosystems(lat, lng, radiusKm))
}

/** GET /ecosystems/mine?publickey= — public; see ecosystem.service.ts::findMyEcosystems for why. */
export async function getMyEcosystems(req: Request, res: Response): Promise<void> {
    const publickey = req.query.publickey as string
    if (!publickey) {
        sendError(res, 400, "Field 'publickey' is needed.")
        return
    }
    res.send(await findMyEcosystems(publickey))
}

/** GET /ecosystems/:pk — public, full chain + metadata. */
export async function getEcosystemInfo(req: Request, res: Response): Promise<void> {
    const row = await Ecosystem.findOne({ where: { publickey: req.params.pk } }) as any
    if (!row) {
        res.status(404).send()
        return
    }
    const response: EcosystemInfoResponse = {
        publickey: row.publickey,
        name: row.name,
        description: row.description,
        lat: row.lat,
        lng: row.lng,
        iscore: row.iscore,
        blocks: row.blocks,
    }
    res.send(response)
}

/** PUT /ecosystems/:pk/meta — timestamp-auth, caller must be an admin of :pk. */
export async function putEcosystemMeta(req: Request, res: Response): Promise<void> {
    const publickey = req.body?.publickey
    const pk = req.params.pk as string

    if (!(await isAdminOf(pk, publickey))) {
        sendError(res, 403, "Not an admin of this ecosystem", 'NOT_CORE_ADMIN')
        return
    }

    const updates: Record<string, unknown> = {}
    if (req.body.name !== undefined) updates.name = req.body.name
    if (req.body.description !== undefined) updates.description = req.body.description
    if (req.body.lat !== undefined) updates.lat = req.body.lat
    if (req.body.lng !== undefined) updates.lng = req.body.lng

    await Ecosystem.update(updates, { where: { publickey: pk } })
    res.send({ message: "Ecosystem updated." })
}
