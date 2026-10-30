import { randomBytes } from 'node:crypto'
import { User, Ecosystem, WaitingTx, UsedPaper, sequelize } from '../app/models.js'
import { buildSeededUser, parseOptions, parseLevel } from './seed-citizen.js'
import { createEcosystem } from '../app/services/ecosystem.service.js'

export type ResetOptions = {
    adminMail: string
    level: number
}

export type ResetArgs = ResetOptions & {
    confirm: boolean
}

export type Credentials = {
    name: string
    mail: string
    password: string
}

export function parseResetArgs(args: string[]): ResetArgs {
    const options = parseOptions(args)
    if (!options['admin-mail']) throw new Error('--admin-mail is required: the core ecosystem administrator, who validates new accounts')
    return {
        adminMail: options['admin-mail'],
        level: parseLevel(options.level ?? '20'),
        confirm: args.includes('--confirm'),
    }
}

function randomPassword(): string {
    return randomBytes(9).toString('base64url')
}

export async function listAccountsToRecreate(): Promise<{ name: string, mail: string }[]> {
    await sequelize.sync()
    const citizens = await User.findAll({ where: { status: 'active' }, order: [['createdAt', 'ASC']] }) as any[]
    return keepFirstAccountOfEachMail(citizens.map((citizen) => ({ name: citizen.name, mail: citizen.mail })))
}

function keepFirstAccountOfEachMail(accounts: { name: string, mail: string }[]) {
    return accounts.filter((account, index) => accounts.findIndex((other) => other.mail === account.mail) === index)
}

async function activeCitizensCredentials(): Promise<Credentials[]> {
    const accounts = await listAccountsToRecreate()
    return accounts.map((account) => ({ ...account, password: randomPassword() }))
}

function assertIsAmong(adminMail: string, credentials: Credentials[]): void {
    if (!credentials.some((credential) => credential.mail === adminMail)) {
        throw new Error(`${adminMail} is not an active account`)
    }
}

async function wipeDatabase(): Promise<void> {
    for (const model of [User, Ecosystem, WaitingTx, UsedPaper]) {
        await (model as any).destroy({ where: {} })
    }
}

async function createCoreEcosystemAdministeredBy(adminMail: string): Promise<void> {
    const admin = await User.findOne({ where: { mail: adminMail } }) as any
    await createEcosystem(admin.publickey, process.env.ORGANIC_SERVER_NAME || 'Organic server')
}

export async function resetTestAccounts({ adminMail, level }: ResetOptions): Promise<Credentials[]> {
    await sequelize.sync()
    const credentials = await activeCitizensCredentials()
    assertIsAmong(adminMail, credentials)
    const seededUsers = []
    for (const credential of credentials) {
        seededUsers.push(await buildSeededUser({ ...credential, level }))
    }
    await wipeDatabase()
    await User.bulkCreate(seededUsers.map((seeded) => seeded.row))
    await createCoreEcosystemAdministeredBy(adminMail)
    return credentials
}
