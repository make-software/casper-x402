# User Guide

This guide walks through installing, configuring and running the three
applications shipped in this repository: the **x402 facilitator server**, the
demo **resource server**, and the demo **client**.

The main application is [`apps/facilitator`](../apps/facilitator). The
[`examples/server`](../examples/server) and [`examples/client`](../examples/client) apps exist
only to exercise the facilitator end-to-end.

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Go | `1.25+` | matches `go.mod` |
| A Casper node RPC endpoint | — | local NCTL (`http://127.0.0.1:11101/rpc`), testnet or mainnet |
| A funded Casper account | ED25519 / SECP256K1 PEM file | facilitator pays for the settlement deploy |
| A deployed CEP-18 x402 token contract | 32-byte package hash | see [`infra/local/deployer/wasm/Cep18X402.wasm`](../infra/local/deployer/wasm/Cep18X402.wasm) for a reference wasm |

### Local NCTL with Docker Compose

A ready-to-use local stack is provided in
[`infra/local`](../infra/local):

```bash
cd infra/local
docker compose up -d
```

The stack wires together everything needed for an end-to-end local run:

| Service | Image / build                                                                | Purpose | Exposed ports |
|---------|------------------------------------------------------------------------------|---------|---------------|
| `nctl` | `makesoftware/casper-nctl:latest`                                            | Local Casper network (`casper-net-1`). Healthchecks on `/status` until the node reaches `Validate`. | `11101` (RPC), `14101` (status), `18101` (SSE), `25101` |
| `nctlexplorer` | `casper-nctl-explorer:latest`                                                | Web explorer for the local network, pointed at `nctl`. | `8080` |
| `nctl-init` | `busybox`                                                                    | One-shot: fixes permissions on the shared `casper-nctl-assets` volume so the deployer can write to it. | — |
| `deployer` | `rust:bookworm` (runs `./deployer`)                                          | One-shot: deploys the CEP-18 x402 token contract and writes the package hash into the shared volume as `net-1/contract_package_hash`. | — |
| `facilitator` | built from [`infra/docker/build-facilitator.Dockerfile`](../infra/docker/build-facilitator.Dockerfile) | The facilitator under test. Reads the NCTL `user-1` secret key from the shared volume and exports it as `SECRET_KEY_PEM_CASPER_CASPER_NET_1` at container start. | `4022` |
| `server` | built from [`infra/docker/build-server.Dockerfile`](../infra/docker/build-server.Dockerfile)           | The demo resource server. Reads `ASSET_PACKAGE` from the shared volume (written by the deployer) at container start. | `4021` |

All services share a private `dev` bridge network and a
`casper-nctl-assets` named volume — that volume is how the NCTL keys and the
deployed contract package hash are handed between containers.

Once `docker compose up -d` returns, both the facilitator (`:4022`) and the
demo resource server (`:4021`) are healthy and ready. You can then run the
demo client against them from the host:

```bash
go run examples/client/main.go
```

If you just want the network and want to run the facilitator/server locally
(from `go run ...`), start only the base services:

```bash
docker compose up -d nctl nctlexplorer deployer
```

The deployer writes the CEP-18 package hash into the volume; read it with:

```bash
docker compose exec nctl cat /home/casper/casper-nctl/assets/net-1/contract_package_hash
```

Copy that value into `ASSET_PACKAGE` in your `.env`.

## 2. Installation

Clone the repository and download Go modules:

```bash
git clone https://github.com/your-org/casper_x402_facilitator.git
cd casper_x402_facilitator
go mod download
```

## 3. Configuration

All three apps read environment variables and transparently load a `.env` file
from the working directory.

### Facilitator (`apps/facilitator`)

Global variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | no | `4022` | HTTP listen port |
| `LOG_LEVEL` | no | `info` | `debug` \| `info` \| `warn` \| `error` |
| `CASPER_NETWORKS` | no | `casper:casper-test` | Comma-separated CAIP-2 network IDs to accept (e.g. `casper:casper-net-1,casper:casper-test`) |

Per-network variables — each entry in `CASPER_NETWORKS` must define its own
key and RPC endpoint via suffixed env vars. The suffix is the CAIP-2 network
id **uppercased with `:` and `-` replaced by `_`**:

| CAIP-2 id | Suffix |
|---|---|
| `casper:casper` | `CASPER_CASPER` |
| `casper:casper-test` | `CASPER_CASPER_TEST` |
| `casper:casper-net-1` | `CASPER_CASPER_NET_1` |

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY_PEM_<NET>` | **yes** (per network) | — | PEM-encoded private key content used to sign settlement transactions on that network (supports literal newlines or escaped `\n`) |
| `SECRET_KEY_ALGO_<NET>` | no | `ed25519` | `ed25519` or `secp256k1` |
| `RPCURL_<NET>` | **yes** (per network) | — | Casper JSON-RPC endpoint for that network |

Startup fails fast with a single error listing every network that is missing
either `SECRET_KEY_PEM_<NET>` or `RPCURL_<NET>`. Networks can use different
keys and different algorithms — e.g. `casper:casper` with an ED25519 key on
mainnet and `casper:casper-test` with a SECP256K1 key on testnet in the same
process.


### Resource server (`examples/server`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PAYEE_ADDRESS` | **yes** | — | 66-char Casper account hash (format `00<64 hex>`) that will receive payment |
| `FACILITATOR_URL` | **yes** | — | URL of the facilitator (`http://localhost:4022` for local dev) |
| `FACILITATOR_API_KEY` | no | — | API key sent as the `Authorization` header on every facilitator request (`/verify`, `/settle`, `/supported`). Required when the facilitator enforces per-organization quotas. Omit for local development without quota enforcement. |
| `CAIP2_CHAIN_ID` | **yes** | — | CAIP-2 network ID, e.g. `casper:casper-net-1` |
| `ASSET_PACKAGE` | **yes** | — | 64-char hex CEP-18 token contract package hash |


### Client (`examples/client`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLIENT_PRIVATE_KEY_PATH` | **yes** | — | PEM-encoded private key file used to sign the EIP-712 authorization |
| `CLIENT_KEY_ALGO` | no | `ed25519` | `ed25519` or `secp256k1` |
| `SERVER_URL` | no | `http://localhost:4021` | Base URL of the resource server |
| `CAIP2_CHAIN_ID` | **yes** | — | Must match the network accepted by the resource server |

### Example `.env` — single network (local NCTL)

```dotenv
# FACILITATOR
CASPER_NETWORKS=casper:casper-net-1
SECRET_KEY_PEM_CASPER_CASPER_NET_1="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
SECRET_KEY_ALGO_CASPER_CASPER_NET_1=ed25519
RPCURL_CASPER_CASPER_NET_1=http://127.0.0.1:11101/rpc

# RESOURCE SERVER
PAYEE_ADDRESS=000000000000000000000000000000000000000000000000000000000000000000
FACILITATOR_URL=http://localhost:4022
FACILITATOR_API_KEY=your-api-key-here
CAIP2_CHAIN_ID=casper:casper-net-1
ASSET_PACKAGE=0128f81ca57b94a40650c23d314f5d7b363e7dd4acccb714d1d2365d27a41843

# CLIENT
CLIENT_PRIVATE_KEY_PATH=./user2.pem
CLIENT_KEY_ALGO=ed25519
SERVER_URL=http://localhost:4021
```

### Example `.env` — multi-network (mainnet + testnet)

```dotenv
CASPER_NETWORKS=casper:casper,casper:casper-test

# Mainnet
SECRET_KEY_PEM_CASPER_CASPER="-----BEGIN PRIVATE KEY-----\n...mainnet key...\n-----END PRIVATE KEY-----"
SECRET_KEY_ALGO_CASPER_CASPER=ed25519
RPCURL_CASPER_CASPER=https://node.mainnet.casper.network/rpc

# Testnet
SECRET_KEY_PEM_CASPER_CASPER_TEST="-----BEGIN PRIVATE KEY-----\n...testnet key...\n-----END PRIVATE KEY-----"
SECRET_KEY_ALGO_CASPER_CASPER_TEST=secp256k1
RPCURL_CASPER_CASPER_TEST=https://node.testnet.casper.network/rpc
```

## 4. Running the services

Open three terminals from the project root.

### Terminal 1 — facilitator

```bash
go run apps/facilitator/main.go
```

### Terminal 2 — resource server

```bash
go run examples/server/main.go
```

### Terminal 3 — client

```bash
go run examples/client/main.go
```

## 5. Common operations

### Health check

```bash
curl http://localhost:4022/health
curl http://localhost:4021/health
```

Both endpoints return `{"status":"ok"}` and are not protected by x402.

### Verifying a payload manually

```bash
curl -X POST http://localhost:4022/verify \
  -H 'Content-Type: application/json' \
  -d @verify-request.json
```

See [docs/api-reference.md](api-reference.md#post-verify) for the request
shape.

### Listing supported schemes/networks

```bash
curl http://localhost:4022/supported
```

## 6. Troubleshooting

| Symptom                                                  | Likely cause | Fix |
|----------------------------------------------------------|--------------|-----|
| `incomplete configurations for networks [...]` at startup | a network in `CASPER_NETWORKS` is missing its `SECRET_KEY_PEM_<NET>` and/or `RPCURL_<NET>` | set the suffixed vars for every network listed; `<NET>` is the CAIP-2 id uppercased with `:` and `-` turned into `_` |
| `network ... not configured in this signer` on `/verify` | server and facilitator use different networks | align `CAIP2_CHAIN_ID` with `CASPER_NETWORKS` |
| `invalid payTo account-hash`                             | `PAYEE_ADDRESS` not 66-char `00<hex>` | regenerate the payee address from the keypair's account hash |
| `transaction execution failed: ...` during settlement    | CEP-18 contract rejected the authorization (wrong nonce, amount, balance) | check facilitator/settlement logs and the Casper explorer |
| `payload expired` / `validBefore < now`                  | clock skew or slow network | client’s `validBefore` defaults to `MaxTimeoutSeconds` in the requirements; raise the timeout or sync time |

## 7. Running tests

```bash
go test ./...                 # full suite
go test -v ./x402/...         # scheme tests
go test ./x402/mechanisms/casper/exact/facilitator/...
```

## 8. Next steps

- See [api-reference.md](api-reference.md) for endpoint and type reference.
