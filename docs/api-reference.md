# API Reference

This document is a reference for:

1. The **HTTP endpoints** exposed by the facilitator (`apps/facilitator`) and
   the demo resource server (`examples/server`).
2. The **exported Go types, interfaces and functions** under
   [`x402/mechanisms/casper`](../x402/mechanisms/casper) and
   [`x402/signers/casper`](../x402/signers/casper) that integrate Casper into
   the upstream `github.com/x402-foundation/x402/go` framework.

Request/response payloads follow the upstream x402 protocol (V2). Where we
extend or constrain it for Casper, that is noted explicitly.

---

## 1. Facilitator HTTP API (port `4022`)

The facilitator is a thin HTTP shell around `x402.X402Facilitator`. It exposes
the three standard endpoints defined by the x402 spec plus a health probe.

### `GET /supported`

Lists the `(scheme, network)` pairs supported by this facilitator.

**Response `200 OK`:**

```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "casper:casper-net-1",
      "extra": {
        "feePayer": "00...",
        "decimals": 9,
        "symbol": "CSPR",
        "name": "Cep18x402",
        "version": "1"
      }
    }
  ]
}
```

`extra.feePayer` is the facilitator's own account hash — the account that pays
the gas (motes) for the settlement deploy.

### `POST /verify`

Validates an `ExactCasperPayload` against the supplied `PaymentRequirements`
without submitting any on-chain state.

**Request body:**

```json
{
  "paymentPayload": {
    "x402Version": 2,
    "scheme": "exact",
    "network": "casper:casper-net-1",
    "payload": {
      "signature": "<130 hex chars — 65 bytes>",
      "publicKey": "<65 or 68 hex chars — algo prefix + key>",
      "authorization": {
        "from":        "00<64 hex>",
        "to":          "00<64 hex>",
        "value":       "10000",
        "validAfter":  "1710000000",
        "validBefore": "1710000900",
        "nonce":       "<64 hex — 32 bytes>"
      }
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "casper:casper-net-1",
    "payTo": "00<64 hex>",
    "amount": "10000",
    "asset": "<64 hex — CEP-18 package hash>",
    "extra": {"name": "Cep18x402", "version": "1", "decimals": "2", "symbol": "X402"},
    "maxTimeoutSeconds": 900
  }
}
```

**Response `200 OK`:**

```json
{ "isValid": true, "payer": "00..." }
```

On failure, `isValid` is `false` and `invalidReason`/`invalidMessage` describe
the failure. The error codes emitted by the Casper mechanism are defined in
[`x402/mechanisms/casper/exact/facilitator/errors.go`](../x402/mechanisms/casper/exact/facilitator/errors.go),
including `unsupported_scheme`, `network_mismatch`, `malformed_payload`,
`pay_to_mismatch`, `amount_mismatch`, `invalid_pay_to`, `invalid_amount`,
`invalid_asset`, `not_yet_valid`, `payload_expired`, `insufficient_time`,
`missing_token_name`, `missing_token_version`, `failed_to_hash`,
`invalid_signature`.

**Validation rules enforced by Casper:**

- `scheme == "exact"` and `payload.network == requirements.network`.
- `authorization.to == requirements.payTo` (both Casper account hashes
  `00<64 hex>`).
- `authorization.value == requirements.amount` and both non-zero.
- `requirements.asset` is a 64-char hex CEP-18 package hash.
- `validAfter <= now <= validBefore` and `validBefore - now >= 6s`.
- `requirements.extra.name` and `requirements.extra.version` are present (they
  seed the EIP-712 domain).
- The signature is 65 bytes and verifies under the Casper public key against
  the `TransferAuthorization` EIP-712 digest built from the
  `casper-ecosystem/casper-eip-712` types.

### `POST /settle`

Performs the full verify → build deploy → sign → put deploy → wait flow. The
facilitator pays gas; the `authorization` moves CEP-18 tokens from `from` to
`to` via the contract's `transfer_with_authorization` entry point.

**Request body:** identical shape to `POST /verify`.

**Response `200 OK` on success:**

```json
{
  "success": true,
  "transaction": "<64 hex — Casper deploy hash>",
  "network": "casper:casper-net-1",
  "payer": "00..."
}
```

**Response `200 OK` on business failure:**

```json
{
  "success": false,
  "errorReason": "build_deploy_failed",
  "errorMessage": "invalid amount",
  "transaction": "",
  "network": "casper:casper-net-1",
  "payer": "00..."
}
```

`errorReason` values include the verification reasons above plus settlement
ones: `verification_failed`, `build_deploy_failed`, `sign_deploy_failed`,
`put_deploy_failed`, `wait_deploy_failed`.

### `GET /health`

Returns `{"status":"ok"}`. Unauthenticated, intended for liveness probes.

---

## 2. Resource server HTTP API (port `4021`)

The demo server protects `GET /weather` with the x402 Gin middleware and
exposes an unprotected `GET /health`.

### `GET /weather?city=<name>`

- **Without** a valid `PAYMENT-SIGNATURE` header → `402 Payment Required` with
  a body describing the accepted payment options (scheme `exact`, network
  configured via `CAIP2_CHAIN_ID`, asset `ASSET_PACKAGE`, price `$0.001`
  mapped by the registered money parser to `10000` units of the CEP-18 token).
- **With** a valid payment → `200 OK`:

```json
{
  "city": "San Francisco",
  "weather": "foggy",
  "temperature": 60,
  "timestamp": "2026-04-17T10:34:18Z"
}
```

### `GET /health`

Returns `{"status":"ok","version":"2.0.0"}`.

---

## 3. Go packages

### `x402/mechanisms/casper`

Shared constants, types and utilities used by all three roles.

#### Constants

```go
const SchemeExact = "exact"

const (
    NetworkCasperMainnet = "casper:casper"
    NetworkCasperTestnet = "casper:casper-test"
)

var NetworkConfigs = map[string]NetworkConfig{
    NetworkCasperMainnet: {ChainName: "casper",      RPCURL: "https://node.mainnet.casper.network/rpc"},
    NetworkCasperTestnet: {ChainName: "casper-test", RPCURL: "https://node.testnet.casper.network/rpc"},
}
```

#### Types

```go
type NetworkConfig struct {
    ChainName string
    RPCURL    string
}

type AssetInfo struct {
    ContractPackageHash string
    Symbol              string
    Decimals            int
}

type ExactCasperAuthorization struct {
    From        string `json:"from"`        // "00<64 hex>"
    To          string `json:"to"`          // "00<64 hex>"
    Value       string `json:"value"`       // decimal string, asset base units
    ValidAfter  string `json:"validAfter"`  // unix seconds
    ValidBefore string `json:"validBefore"` // unix seconds
    Nonce       string `json:"nonce"`       // 64 hex chars (32 bytes)
}

type ExactCasperPayload struct {
    Signature     string                   `json:"signature"`
    PublicKey     string                   `json:"publicKey"`
    Authorization ExactCasperAuthorization `json:"authorization"`
}
```

#### Interfaces

Consumed by the client and facilitator mechanisms respectively:

```go
// Provides the payer's identity and EIP-712 signature.
type ClientCasperSigner interface {
    AccountAddress() string                          // "00<64 hex>"
    PublicKey() string                               // algo-prefixed hex
    SignEIP712(digest [32]byte) ([65]byte, error)
}

// Lets the facilitator verify signatures and submit deploys.
type FacilitatorCasperSigner interface {
    GetNetworkConfig(ctx context.Context, network string) (NetworkConfig, error)
    GetAddresses(ctx context.Context, network string) []string
    GetPublicKeyHex(ctx context.Context, network string) (string, error)
    VerifyEIP712Signature(digest [32]byte, sig [65]byte, publicKey string) (bool, error)
    SignTransaction(transaction *caspertypes.TransactionV1, network string) error
    PutTransaction(ctx context.Context, network string, transaction caspertypes.TransactionV1) (string, error)
    WaitForTransaction(ctx context.Context, network string, transactionHash string) error
}
```

#### Helpers

```go
func GetNetworkConfig(network string) (*NetworkConfig, error)
func ChainNameFromNetwork(network string) string
func IsValidAddress(s string) bool              // matches ^(00|01)[0-9a-fA-F]{64}$
func IsValidContractPackageHash(s string) bool  // matches ^[0-9a-fA-F]{64}$
func DecodeContractPackageHash(hexStr string) ([32]byte, error)
func ParseAmount(amount string, decimals int) (*big.Int, error)
func FormatAmount(amount *big.Int, decimals int) string
```

### `x402/mechanisms/casper/exact/client`

```go
type ExactCasperScheme struct { /* ... */ }

func NewExactCasperScheme(signer casper.ClientCasperSigner) *ExactCasperScheme
func (c *ExactCasperScheme) Scheme() string
func (c *ExactCasperScheme) CreatePaymentPayload(ctx context.Context, requirements types.PaymentRequirements) (types.PaymentPayload, error)
```

`CreatePaymentPayload`:

- Reads `requirements.Extra["name"]` and `requirements.Extra["version"]` to
  build the Casper EIP-712 domain.
- Generates a 32-byte random `nonce`.
- Sets `validAfter = now - 600` and `validBefore = now + MaxTimeoutSeconds`.
- Signs the `TransferAuthorization` typed-data digest via
  `signer.SignEIP712`.

### `x402/mechanisms/casper/exact/server`

```go
type ExactCasperScheme struct { /* ... */ }

func NewExactCasperScheme() *ExactCasperScheme
func (s *ExactCasperScheme) Scheme() string
func (s *ExactCasperScheme) RegisterMoneyParser(parser x402.MoneyParser) *ExactCasperScheme
func (s *ExactCasperScheme) RegisterAsset(network, asset string, decimals int) *ExactCasperScheme
func (s *ExactCasperScheme) GetAssetDecimals(asset string, network x402.Network) int
func (s *ExactCasperScheme) ParsePrice(price x402.Price, network x402.Network) (x402.AssetAmount, error)
func (s *ExactCasperScheme) EnhancePaymentRequirements(ctx context.Context, requirements types.PaymentRequirements, supportedKind types.SupportedKind, extensionKeys []string) (types.PaymentRequirements, error)
```

`ParsePrice` accepts either:

- A structured map `{amount, asset, extra}` — used as-is.
- A scalar price (`"$0.001"`, `0.01`, `int`, `int64`) — parsed to a decimal
  and resolved through registered `MoneyParser`s.

`EnhancePaymentRequirements` validates the asset/payee format, scales decimal
amounts by the registered asset's decimals, and ensures `Extra.name`/`Extra.version`
are present (they flow into the EIP-712 domain on the client and facilitator).

### `x402/mechanisms/casper/exact/facilitator`

```go
type ExactCasperSchemeConfig struct {
    StandardPaymentMotes *uint64 // optional override for settlement gas payment
}

type ExactCasperScheme struct { /* ... */ }

func NewExactCasperScheme(signer casper.FacilitatorCasperSigner, config *ExactCasperSchemeConfig) *ExactCasperScheme
func (f *ExactCasperScheme) Scheme() string
func (f *ExactCasperScheme) CaipFamily() string               // "casper:*"
func (f *ExactCasperScheme) GetExtra(network x402.Network) map[string]interface{}
func (f *ExactCasperScheme) GetSigners(network x402.Network) []string
func (f *ExactCasperScheme) Verify(ctx context.Context, payload x402types.PaymentPayload, requirements x402types.PaymentRequirements, _ *x402.FacilitatorContext) (*x402.VerifyResponse, error)
func (f *ExactCasperScheme) Settle(ctx context.Context, payload x402types.PaymentPayload, requirements x402types.PaymentRequirements, fctx *x402.FacilitatorContext) (*x402.SettleResponse, error)
```

`Settle` builds a Casper `TransactionV1` calling
`transfer_with_authorization` on the asset's `ByPackageHash` target with the
following named args: `from`, `to`, `amount`, `valid_after`, `valid_before`,
`nonce`, `public_key`, `signature`. The transaction is signed with the
facilitator's key for the target network, submitted via
`FacilitatorCasperSigner.PutTransaction`, and awaited with
`WaitForTransaction`.

### `x402/signers/casper`

Concrete implementations of the signer interfaces, backed by
`github.com/make-software/casper-go-sdk/v2`.

#### `ClientSigner`

```go
type ClientSigner struct { /* ... */ }

func NewClientSignerFromKeyFile(path, algo string) (*ClientSigner, error)
func (s *ClientSigner) AccountAddress() string                     // "00<64 hex>"
func (s *ClientSigner) PublicKey() string                          // "01..." or "02..."
func (s *ClientSigner) SignEIP712(digest [32]byte) ([65]byte, error)
```

`algo` is `"ed25519"` (default) or `"secp256k1"`. The returned signature is
65 bytes formatted as `[algo_byte][64 raw sig bytes]`, compatible with
`keypair.PublicKey.VerifySignature`.

#### `FacilitatorSigner`

```go
type FacilitatorSigner struct { /* ... */ }

func NewFacilitatorSigner(keys map[string]keypair.PrivateKey, rpcURLs map[string]string) *FacilitatorSigner
```

The maps are keyed by CAIP-2 network ID. `PutTransaction` uses
`casperSDK.NewRPCClient` against the configured RPC URL;
`WaitForTransaction` polls `GetTransactionByTransactionHash` every 2 seconds
until execution info is attached (or returns the execution error message).

---

## 4. Error code summary

Scheme-level error codes (stable strings, surfaced through upstream x402
`VerifyError.InvalidReason` / `SettleError.ErrorReason`):

| Code | Emitted by | Meaning |
|------|------------|---------|
| `unsupported_scheme` | Verify | `payload.scheme != "exact"` |
| `network_mismatch` | Verify/Settle | payload and requirements disagree, or facilitator has no key for the network |
| `malformed_payload` | Verify | missing/invalid authorization fields, malformed nonce/signature hex |
| `pay_to_mismatch` | Verify | `authorization.to != requirements.payTo` |
| `amount_mismatch` | Verify | `authorization.value != requirements.amount` |
| `invalid_pay_to` | Verify | `payTo` is not a valid Casper account hash |
| `invalid_amount` | Verify | zero or empty amount |
| `invalid_asset` | Verify | asset is not a valid 64-char hex package hash |
| `not_yet_valid` / `payload_expired` / `insufficient_time` | Verify | timing constraints not satisfied |
| `missing_token_name` / `missing_token_version` | Verify | required EIP-712 domain fields absent |
| `failed_to_hash` / `invalid_signature` | Verify | EIP-712 digest or signature verification failed |
| `verification_failed` | Settle | pre-settlement `Verify` rejected the payload |
| `build_deploy_failed` / `sign_deploy_failed` / `put_deploy_failed` / `wait_deploy_failed` | Settle | Casper transaction build/sign/submit/confirmation error |

See [`x402/mechanisms/casper/exact/*/errors.go`](../x402/mechanisms/casper/exact)
for authoritative string constants.
