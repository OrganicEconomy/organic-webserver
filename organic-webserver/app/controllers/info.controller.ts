import type { Request, Response } from 'express'
import { readFile } from 'node:fs/promises'
import { PROTOCOL_VERSION, type InfoResponse, type ServersResponse } from 'organic-protocol'
import { publicFromPrivate } from 'organic-money/src/index.js'
import { User } from '../models.js'

const API_VERSION = '1'

/** Overridable via KNOWN_SERVERS_FILE so a deployment can keep the directory outside the repo. */
function knownServersFile(): URL | string {
    return process.env.KNOWN_SERVERS_FILE || new URL('../config/known-servers.json', import.meta.url)
}

/**
 * GET /info — public identity card of the server, called by the
 * server-selection screen of the app.
 */
export async function getInfo(_req: Request, res: Response): Promise<void> {
    const info: InfoResponse = {
        protocolVersion: PROTOCOL_VERSION,
        apiVersion: API_VERSION,
        name: process.env.ORGANIC_SERVER_NAME || 'Organic server',
        serverPk: publicFromPrivate(process.env.ORGANIC_SECRET_KEY!),
        corePk: null, // no core ecosystem until Phase 2
        stats: { users: await User.count() },
    }
    res.send(info)
}

/**
 * GET /servers — directory of known servers, maintained by the operator in
 * app/config/known-servers.json. Read on every request so edits need no restart.
 */
export async function getServers(_req: Request, res: Response): Promise<void> {
    let servers: ServersResponse = []
    try {
        servers = JSON.parse(await readFile(knownServersFile(), 'utf8'))
    } catch {
        // a missing or unreadable file is an empty directory, not an error
    }
    res.send(servers)
}
