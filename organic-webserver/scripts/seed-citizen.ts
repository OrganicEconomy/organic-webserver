import { CitizenBlockchain } from 'organic-money/src/index.js'
import { publicFromPrivate, aesEncrypt } from 'organic-money/src/crypto.js'
import bcrypt from 'bcryptjs'
import { User, sequelize } from '../app/models.js'

export type SeedOptions = {
    name: string
    mail: string
    password: string
    level: number
}

type Citizen = InstanceType<typeof CitizenBlockchain>

const BIRTHDATE = new Date(Date.UTC(1990, 0, 1))
const DAYS_PER_BLOCK = 30
const MAX_LEVEL = 20

function toKeyAndValue(arg: string): [string, string] {
    const [, key, value] = /^--([\w-]+)=(.*)$/.exec(arg) ?? []
    return [key, value]
}

export function parseOptions(args: string[]): Record<string, string> {
    return Object.fromEntries(args.map(toKeyAndValue))
}

export function parseLevel(value: string): number {
    const level = Number(value)
    if (!Number.isInteger(level) || level < 1) throw new Error('--level must be a positive integer, e.g. --level=20')
    if (level > MAX_LEVEL) throw new Error(`--level cannot exceed ${MAX_LEVEL}: the whole history is downloaded and replayed at every restore and cross-verification, beyond that it gets too slow`)
    return level
}

export function parseSeedArgs(args: string[]): SeedOptions {
    const options = parseOptions(args)
    if (!options.name) throw new Error('--name is required, e.g. --name=Jonnhy')
    return {
        name: options.name,
        mail: options.mail ?? `${options.name.toLowerCase()}@mail.com`,
        password: options.password ?? 'a',
        level: parseLevel(options.level),
    }
}

function serverSecretKey(): string {
    const secretKey = process.env.ORGANIC_SECRET_KEY
    if (!secretKey) throw new Error('Missing ORGANIC_SECRET_KEY environment variable')
    return secretKey
}

function levelFromExperience(experience: number): number {
    return Math.floor(Math.cbrt(experience)) + 1
}

function daysToReachLevel(level: number): number {
    let experience = 0
    let days = 0
    while (levelFromExperience(experience) < level) {
        experience += levelFromExperience(experience)
        days++
    }
    return days
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
    return bytes
}

async function encryptSecretKeyForStorage(secretKeyHex: string, password: string): Promise<string> {
    const encrypted = await aesEncrypt(hexToBytes(secretKeyHex), password)
    return JSON.stringify({
        msg: toHex(encrypted.msg),
        iv: toHex(encrypted.iv),
        salt: toHex(encrypted.salt),
        verifier: toHex(encrypted.verifier),
    })
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setUTCDate(result.getUTCDate() + days)
    return result
}

function latestPastNoonUTC(): Date {
    const now = new Date()
    const todayNoon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12))
    return todayNoon <= now ? todayNoon : addDays(todayNoon, -1)
}

function payAllMoneyToSelf(citizen: Citizen, citizenSk: string, day: Date): void {
    const amount = citizen.getAvailableMoneyAmount()
    if (amount > 0) citizen.pay(citizenSk, citizen.getMyPublicKey(), amount, day)
}

function isLastDayOfBlock(dayIndex: number): boolean {
    return (dayIndex + 1) % DAYS_PER_BLOCK === 0
}

function startNewBlock(citizen: Citizen, citizenSk: string, day: Date): void {
    citizen.closeLastBlock(citizenSk, day)
    citizen.newBlock()
}

function buildChainAtLevel(name: string, level: number): { citizen: Citizen, citizenSk: string } {
    const today = latestPastNoonUTC()
    const days = daysToReachLevel(level)
    const startDate = addDays(today, -days)
    const citizen = new CitizenBlockchain()
    const citizenSk: string = citizen.startBlockchain(name, BIRTHDATE, serverSecretKey(), null, startDate)

    for (let d = 0; d < days; d++) {
        const day = addDays(startDate, d)
        citizen.createMoneyAndInvests(citizenSk, day)
        payAllMoneyToSelf(citizen, citizenSk, day)
        if (isLastDayOfBlock(d)) startNewBlock(citizen, citizenSk, day)
    }
    citizen.createMoneyAndInvests(citizenSk, today)
    return { citizen, citizenSk }
}

async function assertMailIsFree(mail: string): Promise<void> {
    if (await User.count({ where: { mail } }) > 0) throw new Error(`Mail ${mail} is already used`)
}

export async function buildSeededUser({ name, mail, password, level }: SeedOptions) {
    const { citizen, citizenSk } = buildChainAtLevel(name, level)
    const row = {
        publickey: citizen.getMyPublicKey(),
        name,
        mail,
        password: await bcrypt.hash(password, 10),
        secretkey: await encryptSecretKeyForStorage(citizenSk, password),
        blocks: citizen.export(),
        birthdate: BIRTHDATE.toISOString().slice(0, 10),
        validatorpk: publicFromPrivate(serverSecretKey()),
        devicetoken: null,
    }
    return { row, citizen }
}

export async function seedCitizen(options: SeedOptions): Promise<Citizen> {
    await sequelize.sync()
    await assertMailIsFree(options.mail)

    const { row, citizen } = await buildSeededUser(options)
    await User.create(row)
    return citizen
}
