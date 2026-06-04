# API Reference — organic-webserver

Base URL: `https://<host>/api`

All responses are JSON. Rate limits apply in production (not in `NODE_ENV=test`).

---

## Authentication

Two authentication schemes are used on protected routes, both via the `x-signature` header.

### Block auth (`PUT /users/save`, `PUT /users/sign`)

The client signs the hash of the block being submitted:

```js
const block = BlockMaker.make(blockObj)
block.merkle()
const signature = signHash(block.hash(), secretKey)
```

Send: `x-signature: <signature>` + body `{ publickey, block }`.

### Timestamp auth (`GET /tx/list`)

The client signs `sha256(publickey + ":" + timestamp)` where `timestamp` is a Unix timestamp in seconds:

```js
const signature = signHash(hashTimestampAuth(publickey, timestamp), secretKey)
```

Send: `x-signature: <signature>` + query params `?publickey=<pk>&timestamp=<ts>`.

Tolerance: ±5 minutes. Requests outside this window are rejected with 401.

---

## Rate limits (production)

| Route | Limit |
|---|---|
| `POST /api/users/login` | 10 requests / 15 min / IP |
| All other `/api/*` routes | 8 requests / min / IP |

---

## Users

### `POST /api/users/register`

Register a new user. The blockchain must contain exactly one BirthBlock awaiting validation — the server signs it with its secret key.

**Body:**
```json
{
  "publickey": "02...",
  "name": "Alice",
  "mail": "alice@example.com",
  "password": "plaintext",
  "secretkey": "hex-encoded-encrypted-sk",
  "blocks": [ ...blockchain export ]
}
```

**Responses:**
- `200` — `{ publickey, blocks }` (validated blockchain)
- `400` — missing fields or invalid blockchain

---

### `POST /api/users/login`

**Body:**
```json
{ "mail": "alice@example.com", "password": "plaintext" }
```

**Responses:**
- `200` — `{ publickey, name, mail, secretkey, blocks }`
- `400` — missing fields
- `404` — unknown user or wrong password

The response never includes the hashed password.

---

### `PUT /api/users/save` — requires block auth

Save an updated block to the user's blockchain. Also removes any `WaitingTx` included in that block.

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
- `500` — blockchain update error (JSON)

---

### `PUT /api/users/sign` — requires block auth

Sign the last block of the user's blockchain using the server's secret key.

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

## Transactions

### `POST /api/tx/send`

Submit a pending transaction. The transaction must be cryptographically valid and the sender (`tx.s`) must be a registered user.

**Body:**
```json
{ "tx": { ...transaction export } }
```

Transaction export format: `{ v, d, s, p, m, i, t, h }` where:
- `v` = version of the protocol
- `d` = date as int YYYYMMDD (creation date)
- `s` = signer (sender public key)
- `p` = target (recipient public key)
- `m` = money (money of the transaction)
- `i` = invests (invests of the transaction)
- `t` = type
- `h` = signature

**Responses:**
- `200` — success
- `400` — missing or invalid transaction
- `403` — sender not registered

---

### `GET /api/tx/list` — requires timestamp auth

List pending transactions for a given public key.

**Headers:** `x-signature: <signature>`

**Query params:** `?publickey=<pk>&timestamp=<unix_seconds>`

**Responses:**
- `200` — array of `WaitingTx` records
- `401` — missing signature, invalid signature, or expired timestamp

---

## Papers

### `GET /api/isCashed`

Check if a paper (by hash) has already been cashed.

**Query params:** `?hash=<141-char-hash>`

**Responses:**
- `200` — `{ id }` (paper exists and is cashed)
- `400` — missing or invalid hash format (must be exactly 141 chars)
- `404` — paper not found

---

### `POST /api/cashPaper`

Cash a paper.

**Body:**
```json
{ "hash": "<141-char-hash>" }
```

**Responses:**
- `200` — success message
- `400` — missing or invalid hash format
