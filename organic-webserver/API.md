# API Reference — organic-webserver

Base URL: `https://<host>/api/v1` (a legacy `https://<host>/api` alias is kept for the duration of Phase 1). This is the server-side implementation of the standard described in [PROTOCOL.md](https://github.com/OrganicEconomy/organic-protocol/blob/main/PROTOCOL.md) (package [`organic-protocol`](https://www.npmjs.com/package/organic-protocol)) — that document is authoritative for wire formats and semantics; this one lists what this server actually exposes.

All responses are JSON. Non-2xx responses carry `{ "error": "<message>", "code"?: "<ApiErrorCode>" }`; `code` is only present for the enumerated cases below. Rate limits apply in production (not in `NODE_ENV=test`).

---

## Authentication

Two authentication schemes, both via the `x-signature` header (PROTOCOL.md §5.1).

### Block auth (`PUT /users/save`, `PUT /users/sign`)

The client signs the hash of the block being submitted:

```js
const block = BlockMaker.make(blockObj)
block.merkle()
const signature = signHash(block.hash(), secretKey)
```

Send: `x-signature: <signature>` + body `{ publickey, block, ... }`.

### Timestamp auth (`GET /tx/list`, `POST /users/password`)

The client signs `sha256(publickey + ":" + timestamp)` where `timestamp` is a Unix timestamp in seconds:

```js
const signature = signHash(hashTimestampAuth(publickey, timestamp), secretKey)
```

Send: `x-signature: <signature>` + `publickey`/`timestamp` as query params (GET) or body fields (POST).

Tolerance: ±5 minutes. Requests outside this window, or with a bad signature, are rejected with 401.

---

## Rate limits (production)

| Route | Limit |
|---|---|
| `POST /users/login` | 10 requests / 15 min / IP |
| All other routes | 8 requests / min / IP |

---

## Server info

### `GET /info`

Public identity card of the server (protocol/API versions, name, signing key, user count) — used by the app's server-selection screen.

**Responses:**
- `200` — `{ protocolVersion, apiVersion, name, serverPk, corePk, stats: { users } }` (`corePk` is `null` until Phase 2)

### `GET /servers`

Directory of servers the operator knows about (`app/config/known-servers.json`, or `KNOWN_SERVERS_FILE` if set).

**Responses:**
- `200` — `[ { name, url }, ... ]`

---

## Users

### `POST /users/register`

Register a new user. The blockchain must contain exactly one BirthBlock awaiting validation — the server signs it with its secret key (Phase 1: open genesis, every account is validated). A `devicetoken` is issued.

**Body:**
```json
{
  "publickey": "02...",
  "name": "Alice",
  "mail": "alice@example.com",
  "password": "plaintext",
  "birthdate": "1990-03-15",
  "secretkey": "hex-encoded-encrypted-sk",
  "blocks": [ ...blockchain export ]
}
```

**Responses:**
- `200` — `{ publickey, blocks, devicetoken }` (validated blockchain)
- `400` — missing fields or invalid blockchain

---

### `POST /users/login`

Rotates the `devicetoken`: the previous device becomes invalid (PROTOCOL.md §5.4) and gets `409 DEVICE_REVOKED` on its next `save`.

**Body:**
```json
{ "mail": "alice@example.com", "password": "plaintext" }
```

**Responses:**
- `200` — `{ publickey, name, mail, secretkey, blocks, devicetoken }` (a NEW devicetoken)
- `400` — missing fields
- `404` — unknown user or wrong password

The response never includes the hashed password.

---

### `PUT /users/save` — requires block auth

Save an updated block to the user's blockchain. Also removes any `WaitingTx` included in that block.

**Headers:** `x-signature: <signature>`

**Body:**
```json
{ "publickey": "02...", "block": { ...block export }, "devicetoken": "..." }
```

**Responses:**
- `200` — success
- `400` — missing fields
- `401` — missing or invalid signature
- `404` — unknown user
- `409 DEVICE_REVOKED` — `devicetoken` does not match the active device (a more recent login happened elsewhere)
- `500` — blockchain update error (JSON)

---

### `PUT /users/sign` — requires block auth

Sign the last block of the user's blockchain using the server's own secret key — the server acting as referent, e.g. countersigning a paper cash-in. No devicetoken check: this is a server-driven operation, not a client save.

**Headers:** `x-signature: <signature>`

**Body:**
```json
{ "publickey": "02...", "block": { ...block export } }
```

**Responses:**
- `200` — success
- `400` — missing fields
- `401` — missing or invalid signature
- `404` — unknown user
- `500` — block already signed or signing error (JSON)

---

### `POST /users/password` — requires timestamp auth

Change the login password. The client decrypts `secretkey` with the old password, re-encrypts it with the new one, and sends both — the server never reads either password in the clear, and updates its bcrypt hash plus the re-encrypted key without decrypting it.

**Headers:** `x-signature: <signature>`

**Body:**
```json
{ "publickey": "02...", "timestamp": 1753000000, "newpassword": "plaintext", "secretkey": "hex-encoded-encrypted-sk" }
```

**Responses:**
- `200` — success
- `400` — missing fields
- `401` — missing/invalid signature or expired timestamp
- `404` — unknown user

---

## Transactions

### `POST /tx/send`

Submit a pending transaction for delivery to its target. Performs the mandatory cross-verification (PROTOCOL.md §5.3): ① the transaction must be cryptographically valid ② the sender (`tx.s`) must be a registered user ③ the sender's **saved** chain must be valid ④ the transaction must actually appear in that chain's history. Without step ④, anyone could sign a transaction moving units they never owned — this is why the client-side order `pay → save → send` is strict.

**Body:**
```json
{ "tx": { ...transaction export } }
```

Transaction export format: `{ v, d, s, p, m, i, t, h }` — see PROTOCOL.md §2.1.

**Responses:**
- `200` — success
- `400 INVALID_TX` — missing or cryptographically invalid transaction
- `403 UNKNOWN_SENDER` — sender not registered
- `400 INVALID_CHAIN` — sender's saved chain fails validation
- `404 TX_NOT_IN_CHAIN` — the transaction is not (yet) part of the sender's saved chain

---

### `GET /tx/list` — requires timestamp auth

List pending transactions for a given public key.

**Headers:** `x-signature: <signature>`

**Query params:** `?publickey=<pk>&timestamp=<unix_seconds>`

**Responses:**
- `200` — array of transaction exports
- `401` — missing signature, invalid signature, or expired timestamp

---

### `POST /tx/verify`

Read-only, public. Deferred verification of a payment received hand-to-hand offline (QR code) once the network is back — unlike `tx/send`, it never writes anything.

**Body:**
```json
{ "tx": { ...transaction export } }
```

**Responses:** always `200` — `{ "status": "confirmed" | "pending" | "invalid" | "unknown-sender" }`
- `confirmed` — the tx is in the sender's saved, valid chain
- `pending` — sender known and chain valid, but the tx isn't saved there yet
- `invalid` — malformed/forged transaction, or the sender's saved chain is itself invalid
- `unknown-sender` — the signer is not a registered user of this server

---

## Papers

### `GET /papers/isCashed`

Check if a paper (by hash) has already been cashed.

**Query params:** `?hash=<141-char-hash>`

**Responses:**
- `200` — the hash (paper exists and is cashed)
- `400` — missing or invalid hash format (must be exactly 141 chars)
- `404` — paper not found

---

### `POST /papers/cash`

Cash a paper bill. Requires the **full transaction**, not a bare hash — the server verifies its crypto (and that it really is a `PAPER` transaction) before registering `tx.h` as used, closing the previous hole where anyone who merely knew a hash could burn it without proof.

**Body:**
```json
{ "tx": { ...PAPER transaction export } }
```

**Responses:**
- `200` — success message
- `400 INVALID_TX` — missing, cryptographically invalid, or not a PAPER transaction
- `409 ALREADY_CASHED` — this paper was already cashed
