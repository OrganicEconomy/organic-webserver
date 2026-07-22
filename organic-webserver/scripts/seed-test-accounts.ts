/**
 * Dev-only tool: creates one fully-formed test account directly in the
 * database, with D days of simulated activity (daily money creation +
 * occasional self-pay) genuinely dated in the past. Call it once per
 * account you want (mail is derived from the name + a timestamp, so
 * repeated calls with the same name don't collide).
 *
 * Why not just call the real /register + /save endpoints in a loop instead?
 * Because a normal registration is anchored by the InitializationBlock the
 * *running server* signs at that exact moment — every subsequent transaction
 * must be dated on or after it (Blockchain._addTransaction), so a freshly
 * registered account can only simulate activity moving forward from "now",
 * never backdated. Here we build the whole chain ourselves — including the
 * referent-signed InitializationBlock — with the API the server itself uses
 * (CitizenBlockchain.startBlockchain), so every date can genuinely be in the
 * past, then insert the result with the same Sequelize model the server uses.
 *
 * Usage (from this package's root):
 *   npm run seed -- --name=Jonnhy --days=30
 *   npm run winseed -- --name=Jonnhy --days=30
 */
import { CitizenBlockchain } from 'organic-money/src/index.js'
import { publicFromPrivate, aesEncrypt } from 'organic-money/src/crypto.js'
import bcrypt from 'bcryptjs'
import { User, sequelize } from '../app/models.js'

const PASSWORD = 'a'
const SERVER_SECRET_KEY = process.env.ORGANIC_SECRET_KEY as string
if (!SERVER_SECRET_KEY) {
  throw new Error('Missing ORGANIC_SECRET_KEY environment variable')
}

function parseArgs(): { name: string; days: number } {
  const opts: Record<string, string> = {}
  for (const arg of process.argv.slice(2)) {
    const m = /^--([\w-]+)=(.*)$/.exec(arg)
    if (m) opts[m[1]] = m[2]
  }
  const name = opts['name']
  const days = Number(opts['days'] ?? 30)
  if (!name) throw new Error('--name is required, e.g. --name=Jonnhy')
  if (!Number.isInteger(days) || days < 1) throw new Error('--days must be a positive integer')
  return { name, days }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  return bytes
}

/**
 * Mirrors organic-webapp's secret-key-crypto.util.ts byte-for-byte — a test
 * account is only useful if "Restaurer mon compte" in the real webapp can
 * decrypt it with the password above.
 */
async function encryptSecretKeyForStorage(secretKeyHex: string, password: string): Promise<string> {
  const encrypted = await aesEncrypt(hexToBytes(secretKeyHex), password)
  return JSON.stringify({
    msg: toHex(encrypted.msg),
    iv: toHex(encrypted.iv),
    salt: toHex(encrypted.salt),
    verifier: toHex(encrypted.verifier),
  })
}

// UTC-anchored throughout: organic-money's dateToInt reads getUTCFullYear/
// Month/Date, so a date built at local midnight can silently land on the
// previous UTC day whenever the machine's timezone is ahead of UTC.
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function todayUTC(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

async function main(): Promise<void> {
  const { name, days } = parseArgs()
  const startDate = addDays(todayUTC(), -days)
  const birthdate = new Date(Date.UTC(1990, 0, 1))
  const mail = `seed-${name.toLowerCase()}-${Date.now()}@example.test`

  await sequelize.sync()

  const citizen = new CitizenBlockchain()
  const citizenSk: string = citizen.startBlockchain(name, birthdate, SERVER_SECRET_KEY, null, startDate)

  for (let d = 0; d < days; d++) {
    const day = addDays(startDate, d)
    citizen.createMoneyAndInvests(citizenSk, day)

    // Every few days, a small self-payment: adds XP/history variety without
    // ever spending more than what's actually available.
    if (d > 0 && d % 4 === 0) {
      const amount = Math.min(2, citizen.getAvailableMoneyAmount())
      if (amount > 0) {
        citizen.pay(citizenSk, citizen.getMyPublicKey(), amount, day)
      }
    }
  }

  const publickey = citizen.getMyPublicKey()
  const secretkey = await encryptSecretKeyForStorage(citizenSk, PASSWORD)
  const password = await bcrypt.hash(PASSWORD, 10)

  await User.create({
    publickey,
    name,
    mail,
    password,
    secretkey,
    blocks: citizen.export(),
    birthdate: birthdate.toISOString().slice(0, 10),
    validatorpk: publicFromPrivate(SERVER_SECRET_KEY),
    devicetoken: null,
  })

  console.log(`✓ ${name}  niveau ${citizen.getLevel()}  solde ${citizen.getAvailableMoneyAmount()}`)
  console.log(`\nConnecte-toi dans la webapp via "Restaurer mon compte" avec :`)
  console.log(`  mail : ${mail}`)
  console.log(`  mot de passe : ${PASSWORD}`)

  await sequelize.close()
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
