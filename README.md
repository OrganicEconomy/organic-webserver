
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

```javascript
npm install
```

### Run server

Locally

```javascript
node server.js
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

```bash
npm test
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

### Routes for users

#### POST /users/register

As it's named, to register a new user. It validates the initialized blockchain sent by the app.

```json
{
  publickey, // user's public key
  name,
  mail,
  password,
  secretkey, // user's secret key encrypted with password, using encrypt from 'ethereum-cryptography/aes.js'
  blockchain // blockchain initialized but not validated yet
}
```

Return 200 OK + the validated blockchain

#### PUT /users/save

To save the given block into the pk's associated blockchain.

```json
{
  publickey, // user's public key
  block // the last block of the user's blockchain
}
```

Return 200 OK

#### PUT /users/sign

To sign and also save the given block from pk's associated blockchain.

```json
{
  publickey, // user's public key
  block      // the last block of the user's blockchain
}
```

Return 200 OK + the signed block

#### GET /users/login

To login from a new device

```json
{
  mail,
  password
}
```

Return 200 OK +

```json
{
  publickey,
  name,
  mail,
  secretkey,
  blocks
}
```

### Routes for transactions

#### PUT /tx/send

To add given transaction(tx) to the waiting list.

```json
{
  tx // the transaction to send
}
```

Return 200 OK

#### GET /tx/list

To get the list of transactions waiting for pk to cash it.

```json
{
  publickey // user's public key
}
```

Return 200 OK + the list of transaction

### Routes for papers

#### POST /papers/send

To add given paper to the cashed papers list. Involving it to be refused if tried to be cashed two or more times.

```json
{
  papers: [ paper1, paper2, ... ] // the list of papers (i.e. transactions) to cash
}
```

Return 200 OK

### Example

#### 1. Create the user

```bash
curl -i -X POST -H 'Content-Type: application/json' --insecure -d '{"publickey": "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3", "name": "Gus", "mail": "gus@@gus.gus", "password": "my password", "secretkey": "thisisprivate", "blocks": [{ "version": 1, "closedate": 20251125, "previousHash": "c1a551ca1c0deea5efea51b1e1dea112ed1dea0a5150f5e11ab1e50c1a15eed5", "signer": "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3", "merkleroot": "2ab52b946cc5e2abb58c868ea0cbd6805f487a55e1daa9c6b95b63d1f45a650d", "money": [ 20251125000 ], "invests": [ 20251125000 ], "total": 0, "transactions": [ { "version": 1, "date": 19891124, "source": "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3", "target": "Gus", "signer": 0, "money": [], "invests": [], "type": 0, "hash": "304402202d96f8ac796a635573d7f8ad9bfef57cf8109de31e8c99728618f2c2e84e100f0220717f9c7bba840a3c43611d1595f8b2b34988a5af832d83aac88dcd21098b8a28" }, { "version": 1, "date": 20251125, "source": "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3", "target": "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3", "signer": 0, "money": [ 20251125000 ], "invests": [ 20251125000 ], "type": 1, "hash": "3045022100f7de0a89d36d5f037107ccdcb8792a293efd44de9f4331f4ed80ae11d1d9918102202ec9940e5f6bb51d956f6e2a65723648d1a960776eee24ff16ece6273bcae7aa" } ], "hash": "3044022059f27e26aa5395992d4cd7aeeae89cd2d36b348f322b837105378c4048e8a93302204293d99df6cb653ed5c67f1aa36ec93f9ce00786f5625e5864668c9ca362e2ad" }]}' https://127.0.0.1:6868/api/users/register
```

Response:

```json
{"id":1,"publickey":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","name":"Gus","mail":"gus@@gus.gus","password":"my password","secretkey":"thisisprivate","blocks":[{"closedate":20251125,"previousHash":"3044022059f27e26aa5395992d4cd7aeeae89cd2d36b348f322b837105378c4048e8a93302204293d99df6cb653ed5c67f1aa36ec93f9ce00786f5625e5864668c9ca362e2ad","signer":"03cc07f5991f75ceaa48f3351c3a45717c81dc598b383ad53c7509b7641b90575f","merkleroot":0,"money":[],"invests":[],"total":0,"transactions":[],"version":1,"hash":"304402200f52b714b5039bc954690210c7b78209206abfde698458993b40ccebce9ec79802201eb933b73586c0fba9c02e18a1c4389c900754e5840585605429ad27f1f9f1af"},{"version":1,"closedate":20251125,"previousHash":"c1a551ca1c0deea5efea51b1e1dea112ed1dea0a5150f5e11ab1e50c1a15eed5","signer":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","merkleroot":"2ab52b946cc5e2abb58c868ea0cbd6805f487a55e1daa9c6b95b63d1f45a650d","money":[20251125000],"invests":[20251125000],"total":0,"transactions":[{"version":1,"date":19891124,"source":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","target":"Gus","signer":0,"money":[],"invests":[],"type":0,"hash":"304402202d96f8ac796a635573d7f8ad9bfef57cf8109de31e8c99728618f2c2e84e100f0220717f9c7bba840a3c43611d1595f8b2b34988a5af832d83aac88dcd21098b8a28"},{"version":1,"date":20251125,"source":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","target":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","signer":0,"money":[20251125000],"invests":[20251125000],"type":1,"hash":"3045022100f7de0a89d36d5f037107ccdcb8792a293efd44de9f4331f4ed80ae11d1d9918102202ec9940e5f6bb51d956f6e2a65723648d1a960776eee24ff16ece6273bcae7aa"}],"hash":"3044022059f27e26aa5395992d4cd7aeeae89cd2d36b348f322b837105378c4048e8a93302204293d99df6cb653ed5c67f1aa36ec93f9ce00786f5625e5864668c9ca362e2ad"}],"updatedAt":"2025-11-25T17:26:09.491Z","createdAt":"2025-11-25T17:26:09.491Z"}
```

#### 2. Save user

```bash
curl -i -X PUT -H 'Content-Type: application/json' --insecure -d '{"publickey":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","block":{"closedate":20251125,"previousHash":"3044022059f27e26aa5395992d4cd7aeeae89cd2d36b348f322b837105378c4048e8a93302204293d99df6cb653ed5c67f1aa36ec93f9ce00786f5625e5864668c9ca362e2ad","signer":"03cc07f5991f75ceaa48f3351c3a45717c81dc598b383ad53c7509b7641b90575f","merkleroot":0,"money":[],"invests":[],"total":0,"transactions":[],"version":1,"hash":"304402200f52b714b5039bc954690210c7b78209206abfde698458993b40ccebce9ec79802201eb933b73586c0fba9c02e18a1c4389c900754e5840585605429ad27f1f9f1af"}}' https://127.0.0.1:6868/api/users/save
```

#### 3. Sign a new block

```bash
curl -i -X PUT -H 'Content-Type: application/json' --insecure -d '{"publickey":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","block":{"closedate":null,"version":1,"previousHash":"304402200f52b714b5039bc954690210c7b78209206abfde698458993b40ccebce9ec79802201eb933b73586c0fba9c02e18a1c4389c900754e5840585605429ad27f1f9f1af","money":[],"invests":[],"total":0,"merkleroot":0,"signer":null,"transactions":[]}}' https://127.0.0.1:6868/api/users/sign
```

#### 4. Verify

Recuperation of user (to check)

```bash
curl --get --insecure -d "email=gus@@gus.gus" -d "password=my%20password" https://127.0.0.1:6868/api/users/login
```

#### Send transaction

TODO: change this example transaction (which is a Birth transaction with a name in "target" instead of a publickey)

```bash
curl -i -X POST -H 'Content-Type: application/json' --insecure -d '{"tx": {"version":1,"date":19891124,"source":"02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3","target":"Gus","signer":0,"money":[],"invests":[],"type":0,"hash":"304402202d96f8ac796a635573d7f8ad9bfef57cf8109de31e8c99728618f2c2e84e100f0220717f9c7bba840a3c43611d1595f8b2b34988a5af832d83aac88dcd21098b8a28"}}' https://127.0.0.1:6868/api/tx/send
```

#### Get transactions

```bash
curl --get --insecure -d "publickey=<publickey>" https://127.0.0.1:6868/api/tx/list
```
