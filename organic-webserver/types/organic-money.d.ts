/**
 * Minimal typings for the untyped organic-money library — only what the
 * server actually imports. To be replaced by real declarations when the
 * lib ships its own (planned with the webapp work of Phase 1).
 */
declare module 'organic-money/src/index.js' {
  export function publicFromPrivate(secretkey: string): string
  export function signHash(hash: string, secretkey: string): string
  export function verifySignature(hash: string, signature: string, publickey: string): boolean
  export function hashTimestampAuth(publickey: string, timestamp: string | number): string
  export function dateToInt(date: Date): number
  export function intToDate(intdate: number): Date
  export const BlockMaker: any
  export const TransactionMaker: any
  export const Blockchain: any
  export const CitizenBlockchain: any
  export const EcosystemBlockchain: any
}

declare module 'organic-money/src/crypto.js' {
  export function dateToInt(date: Date): number
  export function intToDate(intdate: number): Date
  export function randomPrivateKey(): string
  export function publicFromPrivate(secretkey: string): string
  export interface AesEncrypted {
    msg: Uint8Array
    iv: Uint8Array
    salt: Uint8Array
    verifier: Uint8Array
  }
  export function aesEncrypt(msg: Uint8Array, password: string): Promise<AesEncrypted>
  export function aesDecrypt(encrypted: AesEncrypted, password: string): Promise<Uint8Array>
}
