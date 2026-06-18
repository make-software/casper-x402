# @make-software/casper-x402 Facilitator Example

Express.js facilitator service that verifies and settles Casper x402 payments on-chain. Uses `@make-software/casper-x402/exact/facilitator` and `@x402/core/facilitator`.

## Code shape

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/facilitator";
import { toFacilitatorCasperSigner } from "@make-software/casper-x402";
import casperSdk from "casper-js-sdk";

const facilitator = new x402Facilitator()
  .onBeforeVerify(async ctx => /* log or { abort: true, reason } */)
  .onAfterVerify(async ctx => /* log */)
  .onVerifyFailure(async ctx => /* log */)
  .onBeforeSettle(async ctx => /* log or { abort: true, reason } */)
  .onAfterSettle(async ctx => /* log */)
  .onSettleFailure(async ctx => /* log */);

for (const network of cfg.networks) {
  const { pem, algorithm, rpcUrl } = cfg.keys[network];
  const algo = algorithm === "secp256k1"
    ? casperSdk.KeyAlgorithm.SECP256K1
    : casperSdk.KeyAlgorithm.ED25519;
  const signer = toFacilitatorCasperSigner(
    casperSdk.PrivateKey.fromPem(pem, algo),
    rpcUrl,
  );
  facilitator.register(
    network,
    new ExactCasperScheme(signer, {
      limitedPaymentMotes: cfg.transactionPaymentMotes,
    }),
  );
}
```

## Prerequisites

- Node.js `v20+` (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm `v10` (install via [pnpm.io/installation](https://pnpm.io/installation))
- One PEM-encoded Casper private key per supported network, funded with gas
- A Casper JSON-RPC endpoint per supported network (mainnet, testnet, or NCTL)

## Setup

Configuration is read from environment variables. See [`/.env.template`](../../../env.template) for the full template.

### Global

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | no | Server port (default `4022`) |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error` (default `info`) |
| `CASPER_NETWORKS` | yes | Comma-separated CAIP-2 ids, e.g. `casper:casper,casper:casper-test` |
| `TRANSACTION_PAYMENT_MOTES` | no | Gas budget (motes) per settlement (default `7000000000`) |

### Per-network

Every entry in `CASPER_NETWORKS` must set the corresponding `<NET>`-suffixed vars. The suffix is the CAIP-2 id uppercased with `:` and `-` replaced by `_`:

| CAIP-2 id             | Suffix                |
| --------------------- | --------------------- |
| `casper:casper`       | `CASPER_CASPER`       |
| `casper:casper-test`  | `CASPER_CASPER_TEST`  |
| `casper:casper-net-1` | `CASPER_CASPER_NET_1` |

| Variable | Required | Description |
| --- | --- | --- |
| `SECRET_KEY_PEM_<NET>` | yes | PEM-encoded Casper private key. Pays gas for settlements. Supports literal newlines or escaped `\n`. |
| `SECRET_KEY_ALGO_<NET>` | no | `ed25519` (default) or `secp256k1` |
| `RPCURL_<NET>` | yes | JSON-RPC endpoint for the network |

Startup fails fast with a single error listing every network missing either `SECRET_KEY_PEM_<NET>` or `RPCURL_<NET>`.

> **Security note** — the facilitator key signs settlement transactions and pays gas. Keep it separate from your seller `payTo` wallet and buyer test wallets, and fund it only for facilitator fees.

## Run

Install and build all workspace packages, then start the facilitator:

```bash
cd ../../            # js/ workspace root
pnpm install
pnpm build
cd examples/facilitator
pnpm dev
```

The facilitator listens on `http://localhost:4022`.

## API

### `GET /supported`

Returns the payment kinds and signers this facilitator supports:

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

### `POST /verify`

Verifies a `PaymentPayload` against `PaymentRequirements`. Returns 200 with `{ isValid, payer }`, or 200 with `{ isValid: false, invalidReason, ... }` on validation failure (verification errors are part of the x402 protocol and do not produce a 4xx HTTP status).

### `POST /settle`

Settles a verified payment on-chain. Returns 200 with `{ success, transaction, network, payer }` on success, or `{ success: false, errorReason, ... }` on settlement failure.

### `GET /health`

Free healthcheck returning `{ "status": "ok" }`.

## Lifecycle hooks

Add custom logic before/after each verify and settle operation. Returning `{ abort: true, reason }` from a `Before*` hook cancels the operation. Returning a result from a `*Failure` hook can recover from the failure.

## See also

- [`../server/`](../server/) — the resource server that talks to this facilitator
- [`../client/`](../client/) — the client that signs payments
- [`/go/examples/facilitator`](../../../go/examples/facilitator/) — the Go facilitator this mirrors
