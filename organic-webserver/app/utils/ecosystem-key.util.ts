/**
 * Encrypts/decrypts an ecosystem's private key at rest, using organic-money's
 * own aesEncrypt/aesDecrypt with a server-held master key instead of a user
 * password. Unlike a citizen's secretkey (client-encrypted, server-opaque —
 * the server can never read it), the server here genuinely needs to decrypt
 * this key to act as the ecosystem's custodian (sign order execution, salary
 * distribution, paper counter-signing). Mirrors the hex/JSON encoding used
 * for citizen secretkeys (organic-webapp's secret-key-crypto.util.ts,
 * scripts/seed-test-accounts.ts) byte-for-byte, just with a different key.
 */
import { aesEncrypt, aesDecrypt } from 'organic-money/src/crypto.js'

const MASTER_KEY = process.env.ORGANIC_MASTER_KEY as string

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
    return bytes
}

export async function encryptEcosystemKey(secretKeyHex: string): Promise<string> {
    const encrypted = await aesEncrypt(hexToBytes(secretKeyHex), MASTER_KEY)
    return JSON.stringify({
        msg: toHex(encrypted.msg),
        iv: toHex(encrypted.iv),
        salt: toHex(encrypted.salt),
        verifier: toHex(encrypted.verifier),
    })
}

export async function decryptEcosystemKey(blob: string): Promise<string> {
    const parsed = JSON.parse(blob)
    const decrypted = await aesDecrypt({
        msg: hexToBytes(parsed.msg),
        iv: hexToBytes(parsed.iv),
        salt: hexToBytes(parsed.salt),
        verifier: hexToBytes(parsed.verifier),
    }, MASTER_KEY)
    return toHex(decrypted)
}
