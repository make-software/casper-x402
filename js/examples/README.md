# x402 TypeScript Examples

This folder contains runnable demos that show the full x402 payment flow on Casper. Each example is a standalone Node.js/TypeScript service that depends on the local `@make-software/casper-x402` package in `packages/mechanisms/casper`.

| Example | Path | Port | Purpose |
|---------|------|------|---------|
| **Facilitator** | `facilitator/` | `4022` | Verifies payment payloads and settles them on-chain |
| **Resource server** | `server/` | `4021` | Express endpoint protected by an x402 paywall |
| **Client** | `client/` | — | Pays for and fetches the protected weather report |

---

## Prerequisites

- Node.js `v20+` (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm `v10` (install via [pnpm.io/installation](https://pnpm.io/installation))
- A funded Casper account (ED25519 or SECP256K1) for the facilitator and for the client
- A deployed CEP-18 token contract package hash on the network you plan to use
- A Casper JSON-RPC endpoint (testnet, mainnet or local NCTL)

---

## Configuration

The server and client examples ship with `.env-local` templates. The facilitator example already has a `.env` file. Copy/rename the templates and fill in your own keys before running.

### Facilitator (`examples/facilitator/.env`)

```bash
CASPER_PRIVATE_KEY_PATH=./myaccount3.pem
CASPER_KEY_ALGORITHM=secp256k1          # or ed25519
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
PORT=4022
```

> **Security note:** The facilitator key signs on-chain settlement transactions. Keep it separate from seller/buyer wallets and fund it only for facilitator gas/fees.

### Resource server (`examples/server/.env-local`)

```bash
CASPER_ADDRESS=0065a1bb912303cda45b4c7d10329ea630c50dd742e508539ad4f5c34be2d97291
FACILITATOR_URL=http://localhost:4022
ASSET=<64-character-cep18-package-hash>
```

The `ASSET` variable is the CEP-18 token contract package hash that the server will require payment in. The server example also hard-codes a default `assetAmount` in `index.ts` for price parsing; update it if your token has different decimals or metadata.

### Client (`examples/client/.env-local`)

```bash
CLIENT_PRIVATE_KEY_PATH=./payer.pem
CLIENT_KEY_ALGO=ed25519              # or secp256k1
SERVER_URL=http://localhost:4021
ENDPOINT_PATH=/weather
```

---

## Build the package

Before running the examples, install dependencies once from the repository root and build the local `@make-software/casper-x402` package so the examples can resolve it:

```bash
pnpm install
pnpm build
```

---

## Run the examples

Open three terminals and start the services in this order:

### 1. Start the facilitator

```bash
# from the repository root
pnpm --filter @x402/core-facilitator-typescript dev
```

You should see:

```text
🚀 Facilitator listening on http://localhost:4022
```

### 2. Start the resource server

```bash
# from the repository root
cp examples/server/.env-local examples/server/.env
# edit examples/server/.env with your payee address, asset hash and facilitator URL
pnpm --filter @x402/express-server-example dev
```

You should see:

```text
Server listening at http://localhost:4021
```

### 3. Run the client

```bash
# from the repository root
cp examples/client/.env-local examples/client/.env
# edit examples/client/.env with your payer key
pnpm --filter casper-client-example start
```

On success, the client prints the weather response and the facilitator logs the verified/settled payment.

---

## Example endpoints

### `GET /weather` (resource server)

Returns a simple weather report once a valid payment signature is provided.

#### First request — payment required

```http
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: <base64-encoded payment requirements>
```

#### Second request — paid response

```http
HTTP/1.1 200 OK
PAYMENT-RESPONSE: <base64-encoded settlement result>

{"report":{"weather":"sunny","temperature":70}}
```

### `GET /supported` (facilitator)

Returns the payment schemes and networks supported by the facilitator:

```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "casper:casper-test",
      "extra": { "feePayer": "..." }
    }
  ],
  "extensions": [],
  "signers": { "casper:*": ["..."] }
}
```

### `POST /verify` and `POST /settle` (facilitator)

These endpoints accept a `{ paymentPayload, paymentRequirements }` body and return verification/settlement results. The resource server calls them automatically via the `@x402/core/server` `HTTPFacilitatorClient`.

---

## Network identifiers

The examples default to Casper Testnet (`casper:casper-test`). You can switch to mainnet or a local NCTL network by updating the `CASPER_RPC_URL` and the network strings in the source files.

Casper CAIP-2 identifiers:

- `casper:casper` — Casper Mainnet
- `casper:casper-test` — Casper Testnet

---

## Troubleshooting

- **Module not found for `@make-software/casper-x402`** — make sure you ran `pnpm install` and `pnpm build` from the repository root.
- **Facilitator returns `invalid_signature`** — verify that the client and facilitator are configured for the same network and that the token `name`/`version` in the server’s `extra` metadata match the CEP-18 contract’s EIP-712 domain.
- **Settlement fails with an RPC error** — confirm the facilitator account has enough CSPR for gas and that the CEP-18 contract package hash is correct.
