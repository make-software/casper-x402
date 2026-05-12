# Casper x402 Facilitator

A Go implementation of the [x402 payment protocol](https://x402.org) for the
[Casper Network](https://casper.network). It adds Casper as a supported network
to the x402 ecosystem so HTTP APIs can require micropayments settled on-chain
using CEP-18 tokens authorized via EIP-712 signatures.

This repository delivers three components:

| Component | Purpose | Port |
|-----------|---------|------|
| **Facilitator** (`apps/facilitator`) | x402 facilitator HTTP server — verifies signatures and settles payments on Casper | `4022` |
| **Resource Server** (`examples/server`) | Demo Gin server that exposes a paid `GET /weather` endpoint protected by x402 | `4021` |
| **Client** (`examples/client`) | Headless demo client that consumes the paid endpoint and signs a payment authorization | — |

The core payment scheme lives under
[`x402/mechanisms/casper/`](x402/mechanisms/casper) and integrates with the
upstream [`github.com/x402-foundation/x402/go`](https://github.com/x402-foundation/x402)
package as a pluggable mechanism for the `casper:*` CAIP-2 family.

---

## What is x402?

x402 is an open standard for internet-native payments over HTTP. When a client
requests a paid resource:

1. The resource server responds with `402 Payment Required` plus
   `PaymentRequirements` describing accepted networks, schemes, prices and
   assets.
2. The client builds a `PaymentPayload` — an EIP-712 signed authorization — and
   replays the request with a `PAYMENT-SIGNATURE` header.
3. The resource server forwards the payload to a **facilitator** for
   verification and, on success, for on-chain settlement.
4. The facilitator submits a Casper `transfer_with_authorization` deploy to the
   CEP-18 contract and waits for confirmation.
5. The resource server returns the protected response.

This repository implements the `exact` scheme on the `casper:*` network family,
backed by the
[casper-ecosystem/casper-eip-712](https://github.com/casper-ecosystem/casper-eip-712)
typed-data specification.

## Architecture

![x402 Casper payment flow](./docs/architecture.png)

_Source: [docs/architecture.mmd](docs/architecture.mmd)_

Under the hood:

- `x402/mechanisms/casper/exact/client` builds signed `ExactCasperPayload`
  values using the `ClientCasperSigner` interface.
- `x402/mechanisms/casper/exact/facilitator` validates signatures, time
  bounds, amounts and addresses, then assembles a `TransactionV1` calling the
  CEP-18 `transfer_with_authorization` entry point.
- `x402/mechanisms/casper/exact/server` ships the server-side plumbing
  consumed by the upstream x402 Gin middleware (`ParsePrice`,
  `EnhancePaymentRequirements`, asset/decimal registration).
- `x402/signers/casper` provides concrete implementations of the
  `ClientCasperSigner` and `FacilitatorCasperSigner` interfaces backed by the
  Casper Go SDK (`github.com/make-software/casper-go-sdk/v2`).

## Requirements

- Go `1.25+`
- A funded Casper account (ED25519 or SECP256K1) for the facilitator
- A deployed CEP-18 x402 token contract (`Cep18X402.wasm` is provided under
  [`infra/local/deployer/wasm`](infra/local/deployer/wasm) for local/testnet testing)
- Access to a Casper JSON-RPC endpoint (testnet, mainnet, or local NCTL)

## Quick start

### 1. Install dependencies

```bash
go mod download
```

### 2. Configure environment variables

Copy the provided `.env` template and fill in values (see
[docs/user-guide.md](docs/user-guide.md#configuration) for the full reference):

```bash
# FACILITATOR
CASPER_NETWORKS=casper:casper-net-1
# Per-network key + RPC — suffix is the CAIP-2 id uppercased with ':' and '-' replaced by '_'
SECRET_KEY_PEM_CASPER_CASPER_NET_1="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
SECRET_KEY_ALGO_CASPER_CASPER_NET_1=ed25519
RPCURL_CASPER_CASPER_NET_1=http://127.0.0.1:11101/rpc

# RESOURCE SERVER
PAYEE_ADDRESS=00<32-byte-account-hash-hex>
FACILITATOR_URL=http://localhost:4022
CAIP2_CHAIN_ID=casper:casper-net-1
ASSET_PACKAGE=<32-byte-cep18-package-hash-hex>

# CLIENT
CLIENT_PRIVATE_KEY_PATH=./user2.pem
CLIENT_KEY_ALGO=ed25519
SERVER_URL=http://localhost:4021
```

The facilitator supports multiple Casper networks in a single process: list
them all in `CASPER_NETWORKS` and provide one `SECRET_KEY_PEM_<NET>` +
`RPCURL_<NET>` pair per network. See [docs/user-guide.md](docs/user-guide.md#facilitator-appsfacilitator)
for the full variable reference.

### 3. Run the services

In three separate terminals:

```bash
# Terminal 1 — facilitator
go run apps/facilitator/main.go

# Terminal 2 — resource server
go run examples/server/main.go

# Terminal 3 — client (performs a paid request)
go run examples/client/main.go
```

On success, the client prints the weather response and the facilitator logs a
`settle: success=true deploy=<hash>` line for the submitted Casper deploy.

## Project layout

```
casper_x402_facilitator/
├── apps/
│   └── facilitator/       # x402 facilitator HTTP server (:4022)
├── examples/
│   ├── server/            # demo resource server (:4021)
│   └── client/            # demo headless client
├── x402/
│   ├── mechanisms/casper/ # exact-scheme client/server/facilitator + shared types
│   └── signers/casper/    # Casper SDK-backed signer implementations
├── infra/local/           # docker-compose + NCTL deployer + CEP-18 wasm
├── docs/                  # this documentation set
└── go.mod
```

## Documentation

- **[docs/user-guide.md](docs/user-guide.md)** — installation, configuration
  and how to run the facilitator, resource server and client.
- **[docs/api-reference.md](docs/api-reference.md)** — HTTP endpoints,
  payload/requirement shapes, exported Go types and interfaces.

## Testing

```bash
# Run the full suite
go test ./...

# Scoped to a package
go test ./x402/mechanisms/casper/exact/facilitator/...
```

## License

This project is licensed under the [Apache License 2.0](LICENSE.md).
