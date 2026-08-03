import type { Request, Response } from 'express'
import { User } from '../models.js'
import { sendError } from '../utils/api-error.js'
import { isCoreAdmin, mergeValidationBlock } from '../services/validation.service.js'
import type { ValidationListEntry } from 'organic-protocol'

/**
 * GET /validations — core admins only. Lists citizens waiting for approval,
 * for the "file d'attente" screen (Phase-2.md §4).
 */
export async function listValidations(req: Request, res: Response): Promise<void> {
    const publickey = (req.query.publickey ?? req.body?.publickey) as string
    if (!(await isCoreAdmin(publickey))) {
        sendError(res, 403, "Not a core admin", 'NOT_CORE_ADMIN')
        return
    }

    const pending = await User.findAll({ where: { status: 'pending-validation' } }) as any[]
    const list: ValidationListEntry[] = pending.map((u) => ({
        pk: u.publickey,
        name: u.name,
        requestedAt: u.createdAt.toISOString(),
    }))
    res.send(list)
}

/**
 * GET /validations/:pk — core admins only. The candidate's not-yet-validated
 * chain, for the admin's own device to reconstruct and call validateAccount() on.
 */
export async function getValidation(req: Request, res: Response): Promise<void> {
    const publickey = (req.query.publickey ?? req.body?.publickey) as string
    if (!(await isCoreAdmin(publickey))) {
        sendError(res, 403, "Not a core admin", 'NOT_CORE_ADMIN')
        return
    }

    const candidate = await User.findOne({ where: { publickey: req.params.pk } }) as any
    if (!candidate) {
        res.status(404).send()
        return
    }
    res.send({ name: candidate.name, blocks: candidate.blocks })
}

/** GET /validations/status/:pk — public, for the candidate to poll from any device. */
export async function getValidationStatus(req: Request, res: Response): Promise<void> {
    const candidate = await User.findOne({ where: { publickey: req.params.pk } }) as any
    if (!candidate) {
        res.status(404).send()
        return
    }
    res.send({ status: candidate.status })
}

/**
 * POST /validations/:pk/approve — block-auth already proves `block` was
 * signed by `publickey`; the checks here are what that alone can't give:
 * is the target actually still pending, and is the signer *currently* a
 * core admin (identity ≠ membership).
 */
export async function approveValidation(req: Request, res: Response): Promise<void> {
    const publickey = req.body?.publickey
    const block = req.body?.block
    const targetPk = req.params.pk

    const candidate = await User.findOne({ where: { publickey: targetPk } }) as any
    if (!candidate) {
        sendError(res, 404, "Unknown candidate", 'UNKNOWN_USER')
        return
    }
    if (candidate.status !== 'pending-validation') {
        sendError(res, 409, "This account is not waiting for validation", 'ALREADY_VALIDATED')
        return
    }
    if (!(await isCoreAdmin(publickey))) {
        sendError(res, 403, "Not a core admin", 'NOT_CORE_ADMIN')
        return
    }

    const newBlocks = mergeValidationBlock(candidate.blocks, block)
    if (newBlocks === null) {
        sendError(res, 400, "Invalid validation block", 'INVALID_CHAIN')
        return
    }

    await User.update(
        { blocks: newBlocks, status: 'active', validatorpk: publickey },
        { where: { publickey: targetPk } }
    )
    res.send({ message: "Account validated." })
}

/** POST /validations/:pk/reject — core admins only. Row kept, marked rejected. */
export async function rejectValidation(req: Request, res: Response): Promise<void> {
    const publickey = req.body?.publickey
    const targetPk = req.params.pk

    if (!(await isCoreAdmin(publickey))) {
        sendError(res, 403, "Not a core admin", 'NOT_CORE_ADMIN')
        return
    }

    const candidate = await User.findOne({ where: { publickey: targetPk } })
    if (!candidate) {
        sendError(res, 404, "Unknown candidate", 'UNKNOWN_USER')
        return
    }

    await User.update({ status: 'rejected' }, { where: { publickey: targetPk } })
    res.send({ message: "Account rejected." })
}
