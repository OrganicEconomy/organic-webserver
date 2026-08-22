/**
 * Pure HTTP client E2E scenario — never touches the DB directly (contrast
 * scripts/seed-test-accounts.ts, which builds a chain in-process to backdate
 * history). Builds real blocks/transactions with organic-money and talks to
 * a running server exactly like organic-webapp's server-connection.service.ts
 * does: genesis (+ automatic core ecosystem) -> daily money -> validate a
 * second citizen -> online payment -> cash-in -> ecosystem roles -> invest
 * engagement -> payer order (auto-routed, no claim step) -> salary
 * distribution -> paper (targets the core) -> paper cash-in -> reject
 * double cash-in.
 *
 * Usage:
 *   npm run e2e      (POSIX)
 *   npm run wine2e    (Windows)
 *
 * Defaults to E2E_BASE_URL=http://localhost:6868 (the port in .env.dev) —
 * point it at a docker-compose instance with E2E_BASE_URL=http://localhost:8080.
 */
import { CitizenBlockchain, EcosystemBlockchain, TransactionMaker, signHash, hashTimestampAuth } from 'organic-money/src/index.js'
import { aesEncrypt } from 'organic-money/src/crypto.js'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:6868'
const API = `${BASE}/api/v1`

// ── low-level HTTP + crypto helpers (mirrors server-connection.service.ts) ──

// PROTOCOL.md §9.6 keeps the API rate limiter on in dev/prod (8 req/min) —
// this scenario alone makes more than 8 calls, so a real run against a real
// server WILL get 429'd partway through. Rather than requiring the operator
// to weaken a security control just to run a health-check script, back off
// using the RateLimit-Reset header (seconds until the window clears) and
// retry — exactly what a well-behaved real client should do.
async function request(method, path, { body, headers = {}, query } = {}, attempt = 0) {
  const url = new URL(`${API}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
  }
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 429 && attempt < 3) {
    const resetSeconds = Number(res.headers.get('RateLimit-Reset') || res.headers.get('Retry-After') || 5)
    const waitSeconds = resetSeconds + 1
    console.log(`  … rate-limited (429), waiting ${waitSeconds}s before retrying ${method} ${path}`)
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
    return request(method, path, { body, headers, query }, attempt + 1)
  }
  let json = null
  try { json = await res.json() } catch { /* empty body, e.g. bare 404/401 */ }
  return { status: res.status, json }
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const { status, json } = await request('GET', '/info')
      if (status === 200 && json?.serverPk) return json
    } catch { /* connection refused: not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms at ${BASE} (GET /info never returned 200 + serverPk)`)
}

/** Mutates block (merkle root) as a side effect — call before block.export(). */
function blockAuthHeaders(block, sk) {
  block.merkle()
  return { 'x-signature': signHash(block.hash(), sk) }
}

function timestampAuthHeaders(publickey, sk) {
  const timestamp = Math.floor(Date.now() / 1000)
  const headers = { 'x-signature': signHash(hashTimestampAuth(publickey, String(timestamp)), sk) }
  return { timestamp, headers }
}

/** Builds the {headers, body} pair shared by PUT /users/save and PUT /users/sign. */
function buildBlockAuthRequest(chain, sk, extra = {}) {
  const block = chain.lastblock
  const headers = blockAuthHeaders(block, sk)
  return { headers, body: { publickey: chain.getMyPublicKey(), block: block.export(), ...extra } }
}

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  return bytes
}

/** Mirrors organic-webapp's secret-key-crypto.util.ts byte-for-byte. */
async function encryptSecretKeyForStorage(secretKeyHex, password) {
  const encrypted = await aesEncrypt(hexToBytes(secretKeyHex), password)
  return JSON.stringify({
    msg: toHex(encrypted.msg),
    iv: toHex(encrypted.iv),
    salt: toHex(encrypted.salt),
    verifier: toHex(encrypted.verifier),
  })
}

// ── step runner ──────────────────────────────────────────────────────────

const results = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function step(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name}`)
  } catch (err) {
    results.push({ name, ok: false, error: err.message })
    console.log(`  ✗ ${name}: ${err.message}`)
    throw err
  }
}

// ── domain helper ────────────────────────────────────────────────────────

const BIRTHDATE = new Date(Date.UTC(1990, 0, 1))

// UTC-anchored: organic-money's dateToInt reads getUTC*, so a date built at
// local midnight can silently land on the previous UTC day otherwise (same
// caveat as scripts/seed-test-accounts.ts).
function todayUTC() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function addDays(date, days) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

/**
 * Registers a fresh citizen over the real /users/register endpoint.
 * `genesisDate` is the BirthBlock's own date (default: today) — Block.js's
 * BirthBlock constructor embeds a CreateTransaction dated exactly there,
 * granting one day of money/invests at genesis regardless of what date the
 * server later stamps on the InitializationBlock (that happens via
 * Block.add(), below the Blockchain-level "date >= last closed block" floor
 * check). Backdating it is what makes the catch-up test below possible.
 */
async function registerCitizen(name, genesisDate = new Date()) {
  const chain = new CitizenBlockchain()
  const sk = chain.makeBirthBlock(name, BIRTHDATE, null, genesisDate)
  const mail = `${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`
  const secretkey = await encryptSecretKeyForStorage(sk, 'e2e-encryption-password')

  const body = {
    publickey: chain.getMyPublicKey(),
    name,
    mail,
    password: 'e2e-login-password',
    birthdate: BIRTHDATE.toISOString().slice(0, 10),
    secretkey,
    blocks: chain.export(),
  }

  const { status, json } = await request('POST', '/users/register', { body })
  assert(status === 200, `register(${name}) expected 200, got ${status}: ${JSON.stringify(json)}`)

  return { name, sk, devicetoken: json.devicetoken, status: json.status, chain: new CitizenBlockchain(json.blocks) }
}

async function saveBlock(citizen) {
  const { headers, body } = buildBlockAuthRequest(citizen.chain, citizen.sk, { devicetoken: citizen.devicetoken })
  const { status, json } = await request('PUT', '/users/save', { body, headers })
  assert(status === 200, `save(${citizen.name}) expected 200, got ${status}: ${JSON.stringify(json)}`)
}

async function signBlock(citizen) {
  const { headers, body } = buildBlockAuthRequest(citizen.chain, citizen.sk)
  const { status, json } = await request('PUT', '/users/sign', { body, headers })
  assert(status === 200, `sign(${citizen.name}) expected 200, got ${status}: ${JSON.stringify(json)}`)
}

/** Fetches an ecosystem's public chain and reconstructs it locally. */
async function fetchEcosystem(pk) {
  const { status, json } = await request('GET', `/ecosystems/${pk}`)
  assert(status === 200, `GET /ecosystems/${pk} expected 200, got ${status}: ${JSON.stringify(json)}`)
  return new EcosystemBlockchain(json.blocks)
}

/** Posts a citizen-signed transaction to an ecosystem, after functionally saving the signer's own block. */
async function sendEcosystemTx(signer, ecoPk, tx) {
  await saveBlock(signer)
  const { status, json } = await request('POST', `/ecosystems/${ecoPk}/tx`, { body: { tx: tx.export() } })
  assert(status === 200, `POST /ecosystems/${ecoPk}/tx expected 200, got ${status}: ${JSON.stringify(json)}`)
}

// ── scenario ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`E2E against ${BASE}\n`)

  let server, corePk, A, B

  await step('server becomes ready (GET /info)', async () => {
    server = await waitForServer()
  })

  await step('genesis: register citizen A (10 days ago, for the catch-up test below)', async () => {
    A = await registerCitizen('E2E-Alice', addDays(todayUTC(), -10))
    assert(A.status === 'active', `A (bootstrap/first account) should be immediately active, got ${A.status}`)
  })

  await step("A's registration also created the server's core ecosystem, with her as admin", async () => {
    const info = await request('GET', '/info').then((r) => r.json)
    assert(info.corePk, 'expected /info to report a corePk once the bootstrap account exists')
    corePk = info.corePk
    const core = await fetchEcosystem(corePk)
    assert(core.isAdmin(A.chain.getMyPublicKey()), 'A should be admin of the auto-created core ecosystem')
  })

  await step('genesis: register citizen B (today) — not the bootstrap account, so pending-validation', async () => {
    B = await registerCitizen('E2E-Bob')
    assert(B.status === 'pending-validation', `expected B pending-validation, got ${B.status}`)
    assert(B.chain.isWaitingValidation(), "B's local chain should still be a lone BirthBlock")
  })

  await step('A (core admin) validates B through the validation queue', async () => {
    const listAuth = timestampAuthHeaders(A.chain.getMyPublicKey(), A.sk)
    const { status: listStatus, json: list } = await request('GET', '/validations', {
      headers: listAuth.headers,
      query: { publickey: A.chain.getMyPublicKey(), timestamp: listAuth.timestamp },
    })
    assert(listStatus === 200, `GET /validations expected 200, got ${listStatus}: ${JSON.stringify(list)}`)
    assert(list.some((v) => v.pk === B.chain.getMyPublicKey()), 'B should appear in the pending list')

    const detailAuth = timestampAuthHeaders(A.chain.getMyPublicKey(), A.sk)
    const { status: detailStatus, json: detail } = await request('GET', `/validations/${B.chain.getMyPublicKey()}`, {
      headers: detailAuth.headers,
      query: { publickey: A.chain.getMyPublicKey(), timestamp: detailAuth.timestamp },
    })
    assert(detailStatus === 200, `GET /validations/:pk expected 200, got ${detailStatus}: ${JSON.stringify(detail)}`)

    const candidateChain = new CitizenBlockchain(detail.blocks)
    const initBlock = candidateChain.validateAccount(A.sk)
    const { status: approveStatus, json: approveJson } = await request('POST', `/validations/${B.chain.getMyPublicKey()}/approve`, {
      body: { publickey: A.chain.getMyPublicKey(), block: initBlock.export() },
      headers: blockAuthHeaders(initBlock, A.sk),
    })
    assert(approveStatus === 200, `approve expected 200, got ${approveStatus}: ${JSON.stringify(approveJson)}`)

    B.chain = candidateChain // now validated locally, mirroring server state
  })

  await step("B's status is now active", async () => {
    const { status, json } = await request('GET', `/validations/status/${B.chain.getMyPublicKey()}`)
    assert(status === 200, `expected 200, got ${status}`)
    assert(json.status === 'active', `expected active, got ${json.status}`)
  })

  await step("A's genesis granted exactly one day of money", async () => {
    assert(A.chain.getAvailableMoneyAmount() === 1, `expected 1, got ${A.chain.getAvailableMoneyAmount()}`)
  })

  await step("A's daily money creation catches up the 9 missed days in one call", async () => {
    const created = A.chain.createMoneyAndInvests(A.sk)
    assert(created !== null, 'expected a CreateTransaction, got null')
    assert(
      created.money.length > 1,
      `expected multiple days caught up in one call, got ${created.money.length} — ` +
      'the catch-up loop (CitizenBlockchain.js#makeFilteredIndexes) may have regressed'
    )
    assert(
      A.chain.getAvailableMoneyAmount() === 1 + created.money.length,
      `expected balance 1 + ${created.money.length}, got ${A.chain.getAvailableMoneyAmount()}`
    )
  })

  const PAY_AMOUNT = 2
  let paidTx

  await step(`A pays ${PAY_AMOUNT} to B (pay -> save -> send)`, async () => {
    assert(A.chain.getAvailableMoneyAmount() >= PAY_AMOUNT, 'A has insufficient funds for the test payment')
    paidTx = A.chain.pay(A.sk, B.chain.getMyPublicKey(), PAY_AMOUNT)
  })

  await step('tx/send before save is rejected (404 TX_NOT_IN_CHAIN)', async () => {
    const { status, json } = await request('POST', '/tx/send', { body: { tx: paidTx.export() } })
    assert(status === 404, `expected 404, got ${status}: ${JSON.stringify(json)}`)
    assert(json?.code === 'TX_NOT_IN_CHAIN', `expected code TX_NOT_IN_CHAIN, got ${json?.code}`)
  })

  await step("save A's block", async () => {
    await saveBlock(A)
  })

  await step('tx/send after save is accepted (200)', async () => {
    const { status, json } = await request('POST', '/tx/send', { body: { tx: paidTx.export() } })
    assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(json)}`)
  })

  let rawPending
  await step("B's tx/list returns a bare TxWire[] (PROTOCOL.md §5.2)", async () => {
    const { timestamp, headers } = timestampAuthHeaders(B.chain.getMyPublicKey(), B.sk)
    const { status, json } = await request('GET', '/tx/list', {
      headers,
      query: { publickey: B.chain.getMyPublicKey(), timestamp },
    })
    assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(json)}`)
    assert(Array.isArray(json) && json.length === 1, `expected exactly 1 pending tx, got ${JSON.stringify(json)}`)
    rawPending = json[0]
    const keys = Object.keys(rawPending).sort()
    const expected = ['d', 'h', 'i', 'm', 'p', 's', 't', 'v']
    assert(
      JSON.stringify(keys) === JSON.stringify(expected),
      `expected a flat TxWire (keys ${expected.join(',')}), got keys ${keys.join(',')} — ` +
      'this is exactly the WaitingTx-row-vs-TxWire regression fixed in waiting-tx.controller.ts'
    )
  })

  // Money is single-use (README.md "Money and Invests" / "The Level System"):
  // once paid, it never becomes spendable balance again for the receiver — it
  // converts entirely into their economic experience, which drives their own
  // future daily creation via the level system. B's `money` array is
  // untouched by receivePay; only `experience` (block field `t`, "total")
  // moves. Spendable balance only ever comes from a citizen's own CREATE.
  let experienceBefore
  await step('B reconstructs and receives the payment', async () => {
    experienceBefore = B.chain.experience
    const rx = TransactionMaker.make(rawPending)
    B.chain.receivePay(rx)
  })

  await step("B's economic experience increased by the paid amount (not spendable balance)", async () => {
    assert(
      B.chain.experience === experienceBefore + PAY_AMOUNT,
      `expected experience ${experienceBefore} -> ${experienceBefore + PAY_AMOUNT}, got ${B.chain.experience}`
    )
  })

  await step("save B's block", async () => {
    await saveBlock(B)
  })

  await step('A sets B as an actor of the core ecosystem (ratio 1)', async () => {
    const tx = A.chain.setActor(A.sk, corePk, B.chain.getMyPublicKey(), 1)
    await sendEcosystemTx(A, corePk, tx)
    const core = await fetchEcosystem(corePk)
    assert(core.isActor(B.chain.getMyPublicKey()), 'B should now be an actor')
  })

  await step('A sets herself as an unlimited payer of the core ecosystem', async () => {
    const tx = A.chain.setPayer(A.sk, corePk, A.chain.getMyPublicKey(), -1)
    await sendEcosystemTx(A, corePk, tx)
    const core = await fetchEcosystem(corePk)
    assert(core.isPayer(A.chain.getMyPublicKey()), 'A should now be a payer')
  })

  const PAPER_AMOUNT = 2
  let paperTx

  await step(`A generates a ${PAPER_AMOUNT}-unit paper targeting the core ecosystem`, async () => {
    assert(A.chain.getAvailableMoneyAmount() >= PAPER_AMOUNT, 'A has insufficient funds for the test paper')
    paperTx = A.chain.generatePaper(A.sk, PAPER_AMOUNT, corePk)
  })

  await step("save A's block after generating the paper", async () => {
    await saveBlock(A)
  })

  await step('paper is not cashed yet (404)', async () => {
    const { status } = await request('GET', '/papers/isCashed', { query: { hash: paperTx.signature } })
    assert(status === 404, `expected 404, got ${status}`)
  })

  let paperForB
  let experienceBeforePaper
  await step('B receives the paper hand-to-hand and cashes it locally', async () => {
    // Simulates the wire round-trip a real QR scan would go through.
    experienceBeforePaper = B.chain.experience
    paperForB = TransactionMaker.make(paperTx.export())
    B.chain.cashPaper(paperForB)
  })

  await step("B's economic experience increased by the paper amount", async () => {
    assert(
      B.chain.experience === experienceBeforePaper + PAPER_AMOUNT,
      `expected experience ${experienceBeforePaper} -> ${experienceBeforePaper + PAPER_AMOUNT}, got ${B.chain.experience}`
    )
  })

  await step('papers/cash is accepted and credits the core ecosystem (200)', async () => {
    const { status, json } = await request('POST', '/papers/cash', { body: { tx: paperForB.export() } })
    assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(json)}`)
    const core = await fetchEcosystem(corePk)
    const cashedInCore = core.lastblock.transactions.some((t) => t.type === 5 && t.signature === paperTx.signature)
    assert(cashedInCore, "the core ecosystem's own chain should record the cashed paper")
  })

  await step("sign B's block (referent counter-signs the paper-cashing block)", async () => {
    await signBlock(B)
  })

  await step('paper is now cashed (200)', async () => {
    const { status } = await request('GET', '/papers/isCashed', { query: { hash: paperTx.signature } })
    assert(status === 200, `expected 200, got ${status}`)
  })

  await step('re-cashing the same paper is rejected (409 ALREADY_CASHED)', async () => {
    const { status, json } = await request('POST', '/papers/cash', { body: { tx: paperForB.export() } })
    assert(status === 409, `expected 409, got ${status}: ${JSON.stringify(json)}`)
    assert(json?.code === 'ALREADY_CASHED', `expected code ALREADY_CASHED, got ${json?.code}`)
  })

  await step('A engages invests into the core ecosystem', async () => {
    const tx = A.chain.engageInvests(A.sk, corePk, 1, 3) // 1/day for 3 days
    await sendEcosystemTx(A, corePk, tx)
    const core = await fetchEcosystem(corePk)
    assert(core.invests.length >= 3, `expected at least 3 engaged invests, got ${core.invests.length}`)
  })

  let orderInvestIds
  await step('A (payer) issues an order against those invests, targeting B', async () => {
    const core = await fetchEcosystem(corePk)
    orderInvestIds = core.invests.slice(0, 1)
    const tx = A.chain.payerOrder(A.sk, corePk, B.chain.getMyPublicKey(), orderInvestIds)
    await sendEcosystemTx(A, corePk, tx)
  })

  let orderEarnRaw
  await step('the order executes immediately and B sees it queued — no separate claim step', async () => {
    const { timestamp, headers } = timestampAuthHeaders(B.chain.getMyPublicKey(), B.sk)
    const { status, json } = await request('GET', '/tx/list', {
      headers,
      query: { publickey: B.chain.getMyPublicKey(), timestamp },
    })
    assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(json)}`)
    assert(json.length === 1, `expected exactly 1 pending tx (the order payout), got ${JSON.stringify(json)}`)
    assert(json[0].t === 13, `expected an EARN (13), got type ${json[0].t}`)
    orderEarnRaw = json[0]
  })

  await step('B receives the order payout', async () => {
    const experienceBeforeOrder = B.chain.experience
    const rx = TransactionMaker.make(orderEarnRaw)
    B.chain.receiveEarn(rx)
    assert(B.chain.experience > experienceBeforeOrder, 'expected experience to increase from the order payout')
    await saveBlock(B)
  })

  await step('A (admin) distributes the core ecosystem salary', async () => {
    const authAuth = timestampAuthHeaders(A.chain.getMyPublicKey(), A.sk)
    const { status, json } = await request('POST', `/ecosystems/${corePk}/distribute`, {
      body: { publickey: A.chain.getMyPublicKey(), timestamp: authAuth.timestamp },
      headers: authAuth.headers,
    })
    assert(status === 200, `expected 200, got ${status}: ${JSON.stringify(json)}`)
  })
}

main()
  .then(() => {
    console.log(`\n${results.length} steps, all passing.`)
    process.exitCode = 0
  })
  .catch((err) => {
    const passed = results.filter((r) => r.ok).length
    console.log(`\n${passed}/${results.length} steps passed before failure: ${err.message}`)
    process.exitCode = 1
  })
