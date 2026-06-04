
# Organic webserver

This is the webserver for the organic economy handling.
The organic economy application stands on 3 things :

- this webserver (a REST API in Nodejs + express);
- a POSTGRES database (a very small one);
- a webapp (in angularjs).

## Production

Create a .env file at the root of the folder

Make credentials:

```bash
openssl req -nodes -new -x509 -keyout server.key -out server.cert
```

And save them in `organic-webserver/organic-webserver/keys/`.

## Getting started

### Installation

```bash
npm install
```

### Run server

Locally

```bash
npm run server
```

Or with windows:

```bash
npm run winserver
```

With docker (which will include a Postgres database)

```bash
docker compose up
```

Or to build the app after modifications

```bash
docker compose up --build
```

### Run tests

On unix
```bash
npm test
```

On windows
```bash
npm run wintest
```

## For developpers

Models are in app/models, there are three:

- User:
  - pk: the primary key (also the id) of the user;
  - name: an informative name (for people to read it instead of a pk);
  - mail: the user's email adress, to login when using a new device;
  - password: (in fact, the hash of the password) for login verification;
  - sk: the user's secret key (crypted with user's password) for recovery;
  - bc: the blockchain of the user (a saved one, becaus user has it on he's device too).
- UsedPaper:
  - id: the id of the paper which, being in the database, means it is used and no more cashable.
- WaitingTx:
  - tx: json containing the informations of the transaction that is waiting to be cashed by it's target.

## Routes for users

See [API.md](organic-webserver/API.md) for details.

## Examples

> All examples target the **local dev server** (`npm run winserver`) with the test key (`ORGANIC_SECRET_KEY` from `.env.test`).
>
> Keys used in these examples:
> - **Frodon** — sk: `ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f` / pk: `02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3`
> - **Sam** — sk: `7201979f77794c943300a0070bb8320eccf57a68e10f0a667d8a5a075eb4dfcb` / pk: `0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834`

All block data uses the **exported format** (`block.export()`). Routes marked `[auth]` require an `x-signature` header — see [API.md](organic-webserver/API.md) for how to compute it.

---

### 1. Register Frodon

```bash
curl -i -X POST -H 'Content-Type: application/json' --insecure \
  -d '{"publickey":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","name":"Frodon","mail":"frodon@shire.me","password":"my precious","secretkey":"ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f","blocks":[{"v":1,"d":20251125,"p":"c1a551ca1c0deea5efea51b1e1dea112ed1dea0a5150f5e11ab1e50c1a15eed5","s":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","r":"3834fed267d57fc21c15005ce4ae49123debcd3d24bc897eaf79ced7c464ba54","m":[20251125000],"i":[202511259000],"t":0,"h":"304502210099c4ff42e3e8666cf0f0330d6060ed5986bcf04bd23df6d55b073cbdd9d2af2602203da45e74b96d6a36accc0e640f9d5d3a2b6fc4fe42eb68178a69bdc460245ed9","x":[{"d":20251125,"m":[20251125000],"i":[202511259000],"s":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","t":2,"p":"","v":1,"h":"304402204f97b9c5a82adc50d8273bf6d6302a043ac643730a6cc5e17a3efaa56f5b1cab022020288de07729d16f0dd33d36a31703c133fa7e42be4da981b09ec71861a8e3d3"},{"d":19891124,"m":[],"i":[],"s":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","t":1,"p":"Frodon","v":1,"h":"30440220680652f29e7ca4039d9ecb8b90418a08cc20cfe8370baca062eed1165a7f963f0220296d28a1ec3f13209ddec3d832085698b07cfa5ff14d1576415cc65c38167c25"}]}]}' \
  https://127.0.0.1:6868/api/users/register
```

Response: `{ publickey, blocks }` — the blockchain now contains a server-signed `InitializationBlock` prepended to the original `BirthBlock`.

---

### 2. Register Sam

```bash
curl -i -X POST -H 'Content-Type: application/json' --insecure \
  -d '{"publickey":"0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834","name":"Sam","mail":"sam@shire.me","password":"taters","secretkey":"7201979f77794c943300a0070bb8320eccf57a68e10f0a667d8a5a075eb4dfcb","blocks":[{"v":1,"d":20251125,"p":"c1a551ca1c0deea5efea51b1e1dea112ed1dea0a5150f5e11ab1e50c1a15eed5","s":"0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834","r":"c59eecb7ee403a8ac25741282bab11e672afe39583f90495e7594168dba42186","m":[20251125000],"i":[202511259000],"t":0,"h":"3044022037bc9190b39bcb054490c4f31506a6b2fd084280eae94fde756595f5870d12f002200f8564fa1cc1e31c04e1a1e0d7efef5905078370a5fff8415e9e498030ac23dd","x":[{"d":20251125,"m":[20251125000],"i":[202511259000],"s":"0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834","t":2,"p":"","v":1,"h":"304402206c597ecd62ada00ce4f3f676aacaa47d02760cfdf4b82ca358de5ab28c664c1c0220724562084a81e95db4dfd28de8b6d6c8074c48e743eb60c5d5a8e608faae64d8"},{"d":19900101,"m":[],"i":[],"s":"0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834","t":1,"p":"Sam","v":1,"h":"3045022100c5b787b6cb7cad02348b4315d8093844e3fbd7f6afdea3510acfb68ed45fdd440220059c4832d9d88cf88db9adf8c1633472e53f97485903735af97ae8124f1f41e5"}]}]}' \
  https://127.0.0.1:6868/api/users/register
```

---

### 3. Login

```bash
curl -i -X POST -H 'Content-Type: application/json' --insecure \
  -d '{"mail":"frodon@shire.me","password":"my precious"}' \
  https://127.0.0.1:6868/api/users/login
```

Response: `{ publickey, name, mail, secretkey, blocks }`

---

### 4. Save Frodon's block [auth]

> Frodon creates money and pays Sam. The resulting open block is saved to the server.

```bash
curl -i -X PUT -H 'Content-Type: application/json' \
  -H 'x-signature: 30450221008dcad5014d35b4eac4201cf3564a20a84c17ada2238aa8f6b99c71a6e4729b1402207e0ff6edab5fbbd1d50e0f631172d03fc92c518dc029b0c227b770a69ba0435c' \
  --insecure \
  -d '{"publickey":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","block":{"v":1,"d":99991231,"p":"3045022100f1f99ced8b08b07e6968e691087ee6d146e5829d89a557f2f0db0e8707bf4a2a02201478dce4233405baf5467ec7c81fd514fb5ffc69df3ba34967bbf344771becb4","s":null,"r":0,"m":[],"i":[202511259000],"t":0,"h":null,"x":[{"d":20260604,"m":[20251125000],"i":[],"s":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","t":3,"p":"0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834","v":1,"h":"3044022011670c09cbd20f35e35dbf8d532162b101813317390c2a408d65d081a2fc6ebd022039dcacce321b146224f9ccb028b072707eec02b7726c18a8bc0b9aaff474b90c"}]}}' \
  https://127.0.0.1:6868/api/users/save
```

---

### 5. Sign Frodon's block [auth]

> Asks the server to sign the same open block (closing it). Same block and signature as step 4.

```bash
curl -i -X PUT -H 'Content-Type: application/json' \
  -H 'x-signature: 30450221008dcad5014d35b4eac4201cf3564a20a84c17ada2238aa8f6b99c71a6e4729b1402207e0ff6edab5fbbd1d50e0f631172d03fc92c518dc029b0c227b770a69ba0435c' \
  --insecure \
  -d '{"publickey":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","block":{"v":1,"d":99991231,"p":"3045022100f1f99ced8b08b07e6968e691087ee6d146e5829d89a557f2f0db0e8707bf4a2a02201478dce4233405baf5467ec7c81fd514fb5ffc69df3ba34967bbf344771becb4","s":null,"r":0,"m":[],"i":[202511259000],"t":0,"h":null,"x":[{"d":20260604,"m":[20251125000],"i":[],"s":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","t":3,"p":"0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834","v":1,"h":"3044022011670c09cbd20f35e35dbf8d532162b101813317390c2a408d65d081a2fc6ebd022039dcacce321b146224f9ccb028b072707eec02b7726c18a8bc0b9aaff474b90c"}]}}' \
  https://127.0.0.1:6868/api/users/sign
```

---

### 6. Sam sends a transaction to Frodon

> Sam must be registered (step 2). The transaction is cryptographically signed by Sam.

```bash
curl -i -X POST -H 'Content-Type: application/json' --insecure \
  -d '{"tx":{"d":20260604,"m":[20251125000],"i":[],"s":"0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834","t":3,"p":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","v":1,"h":"304402206733efd22faca89d4bbdefab7411a9380dbc6b8be4857e729fdcca347b161c1402201a73c9e2a48198691993db62ec292b03cc3c8c34cabcd210e47579d0fc2dc103"}}' \
  https://127.0.0.1:6868/api/tx/send
```

---

### 7. Get Frodon's pending transactions [auth]

> The timestamp expires after 5 minutes — generate the signature dynamically:

```bash
TS=$(node -e "console.log(Math.floor(Date.now()/1000))")
SIG=$(TS=$TS node --input-type=module << 'EOF'
import { signHash, hashTimestampAuth } from 'organic-money/src/index.js'
const pk = "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3"
const sk = "ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f"
console.log(signHash(hashTimestampAuth(pk, process.env.TS), sk))
EOF
)
curl --get --insecure \
  -H "x-signature: $SIG" \
  -d "publickey=02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3" \
  -d "timestamp=$TS" \
  https://127.0.0.1:6868/api/tx/list
```
