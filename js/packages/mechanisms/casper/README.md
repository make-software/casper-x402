# @make-software/casper-x402

A TypeScript implementation of the [x402 payment protocol](https://x402.org) for the [Casper Network](https://casper.network). It adds Casper as a supported network to the x402 ecosystem so HTTP APIs can require micropayments settled on-chain using CEP-18 tokens authorized via EIP-712 signatures.

This package is published as `@make-software/casper-x402`.

---

## What is x402?

x402 is an open standard for internet-native payments over HTTP. When a client requests a paid resource:

1. The resource server responds with `402 Payment Required` plus `PaymentRequirements` describing accepted networks, schemes, prices and assets.
2. The client builds a `PaymentPayload` — an EIP-712 signed authorization — and replays the request with a `PAYMENT-SIGNATURE` header.
3. The resource server forwards the payload to a **facilitator** for verification and, on success, for on-chain settlement.
4. The facilitator submits a Casper `transfer_with_authorization` deploy to the CEP-18 contract and waits for confirmation.
5. The resource server returns the protected response.

This package implements the `exact` scheme on the `casper:*` CAIP-2 family, backed by the [casper-ecosystem/casper-eip-712](https://github.com/casper-ecosystem/casper-eip-712) typed-data specification.

---

## Installation

```bash
npm install @make-software/casper-x402
```

Peer / transitive dependencies include `@x402/core`, `casper-js-sdk` and `@casper-ecosystem/casper-eip-712`.

---

## Entry points

The package exposes a root entry with signer helpers and utilities, plus three subpaths for the `exact` scheme.

| Entry | Purpose |
| --- | --- |
| `@make-software/casper-x402` | Signers, types, constants and utilities |
| `@make-software/casper-x402/exact/client` | `ExactCasperScheme` for clients |
| `@make-software/casper-x402/exact/server` | `ExactCasperScheme` and registration for resource servers |
| `@make-software/casper-x402/exact/facilitator` | `ExactCasperScheme` and registration for facilitators |

---

## Network identifiers

Casper networks use [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) format:

- `casper:casper` — Casper Mainnet
- `casper:casper-test` — Casper Testnet

These are exported as `NETWORK_CASPER_MAINNET` and `NETWORK_CASPER_TESTNET` from the package root.

---

## Examples

Runnable examples are available in the [`casper-x402`](https://github.com/make-software/casper-x402) monorepo under `examples/`.

---

## License

This project is licensed under the Apache License 2.0.
