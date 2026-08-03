import assert from "assert"
import { encryptEcosystemKey, decryptEcosystemKey } from "../app/utils/ecosystem-key.util.js"

const SK = "ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f"

describe("ecosystem-key.util", () => {
    it("should round-trip a key through encrypt then decrypt", async () => {
        const encrypted = await encryptEcosystemKey(SK)
        const decrypted = await decryptEcosystemKey(encrypted)
        assert.equal(decrypted, SK)
    })

    it("should store the encrypted blob as opaque JSON, not the plaintext key", async () => {
        const encrypted = await encryptEcosystemKey(SK)
        assert.equal(encrypted.includes(SK), false)
        assert.doesNotThrow(() => JSON.parse(encrypted))
    })

    it("should produce a different ciphertext each time (random salt/iv)", async () => {
        const a = await encryptEcosystemKey(SK)
        const b = await encryptEcosystemKey(SK)
        assert.notEqual(a, b)
    })
})
