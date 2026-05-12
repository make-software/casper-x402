# Configuration pattern

Every binary in this repo loads its environment-variable configuration through
a local `Env` struct defined in a `config.go` next to `main.go`. This document
describes the convention so a new app can adopt it in a few minutes.

## Why a per-binary `Env` struct

- **One declaration, one source of truth.** Every variable the binary reads is
  listed in one place — no scattered `os.Getenv` calls, no drift between the
  code, the `.env` template, and the README.
- **Typed values.** Ports come in as `int`, comma-separated lists as `[]string`,
  durations as `time.Duration`. No per-call parsing in `main`.
- **Required vs optional is declarative.** The `,required` tag fails fast at
  startup with a clear error listing the missing variable name.
- **Per-binary scoping.** Each binary defines only the variables it actually
  uses. The facilitator, the resource server, and the client each have their
  own `Env`; there is no shared god-struct.

## Library

We use [`github.com/caarlos0/env/v11`](https://github.com/caarlos0/env) for
struct parsing and [`github.com/joho/godotenv`](https://github.com/joho/godotenv)
for loading `.env` files in development.

## File layout

Each `main` package contains:

```
apps/<name>/
├── main.go      # wires up the binary, reads cfg.*
└── config.go    # Env struct + Parse()
```

See the existing implementations:
- [apps/facilitator/config.go](../apps/facilitator/config.go)
- [examples/server/config.go](../examples/server/config.go)
- [examples/client/config.go](../examples/client/config.go)

## The `Env` struct

Convention: one struct named `Env`, one method `Parse() error`, one constant
`EnvFile = ".env"`. Fields use the following tags:

| Tag | Purpose |
|---|---|
| `env:"NAME"` | Environment variable name (SCREAMING_SNAKE_CASE). |
| `env:"NAME,required"` | Fail parsing if the variable is empty or unset. |
| `envDefault:"value"` | Fallback when the variable is unset. Applied before `required` is evaluated. |
| `envSeparator:","` | Override the separator for slice fields (default `,`). |

Example — a config that demonstrates every supported case:

```go
package main

import (
    "fmt"
    "time"

    "github.com/caarlos0/env/v11"
    "github.com/joho/godotenv"
)

const EnvFile = ".env"

type Env struct {
    // Optional with a default — most common case.
    LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
    Port     int    `env:"PORT" envDefault:"8080"`

    // Required — startup fails if unset.
    DatabaseURL string `env:"DATABASE_URL,required"`

    // Optional, no default — zero value ("") means "not provided".
    SentryDSN string `env:"SENTRY_DSN"`

    // Slice — comma-separated by default.
    AllowedOrigins []string `env:"ALLOWED_ORIGINS" envDefault:"http://localhost:3000"`

    // Typed durations, booleans, etc. parse automatically.
    RequestTimeout time.Duration `env:"REQUEST_TIMEOUT" envDefault:"30s"`
    DebugMode      bool          `env:"DEBUG" envDefault:"false"`
}

func (e *Env) Parse() error {
	_ = godotenv.Load(EnvFile)

    if err := env.Parse(e); err != nil {
        return err
    }
    return nil
}
```

## Using `Env` in `main`

Parse once at the top of `main`, then pass the struct (or individual fields)
into the rest of the wiring. Parsing happens **before** the logger is
initialized, so a panic is the right failure mode here — there is no structured
logger to write to yet.

```go
func main() {
    var cfg Env
    if err := cfg.Parse(); err != nil {
        panic(fmt.Sprintf("Error parsing configuration: %v", err))
    }

    log := logger.Default() // LOG_LEVEL is read inside Default()
    log.Info("server starting", "port", cfg.Port)

    // ... wire up the rest of the app using cfg.*
}
```

For the demo client (which does not use the structured logger) substitute
`log.Fatalf` for the panic — same shape, different output.

### What `Parse()` does, in order

1. Calls `godotenv.Load(EnvFile)`. A missing `.env` is **not fatal** — the
   error is discarded and startup continues. This keeps local development
   ergonomic (drop a `.env` next to the binary) without breaking production
   deployments that inject variables directly.
2. Calls `env.Parse(e)`, which populates the struct from `os.Environ()`.
   Variables already present in the real environment take precedence over
   `.env` — this lets CI and prod override local defaults.
3. Returns the first error, usually a list of missing `required` fields.

### Interaction with the `LOG_LEVEL` singleton

`internal/logger.Default()` reads `LOG_LEVEL` from the process environment the
first time it is called. Because `godotenv.Load()` happens inside `cfg.Parse()`
and `Parse()` runs before `logger.Default()`, the `.env` value for `LOG_LEVEL`
is honored. Do not call `logger.Default()` before `cfg.Parse()` or you will
lock in the wrong level.

## Adding a variable

1. Add a field to `Env` with the right tag.
2. Replace any `os.Getenv("NAME")` in `main.go` with `cfg.FieldName`.
3. If the variable is required for the binary to function, tag it with
   `,required`; otherwise give it an `envDefault`.
4. Document the variable in the project `README.md` config table, along with
   which binary consumes it.

## Per-network lookups (suffix pattern)

Some variables are naturally _per-network_ — for the facilitator, each entry in
`CASPER_NETWORKS` needs its own signing key and RPC endpoint. The library's
struct tags cannot express "one field per dynamic list entry", so we add a
post-`env.Parse` step that walks the list and reads per-network env vars by
suffix.

Convention: for a CAIP-2 network id, the suffix is the id uppercased with `:`
and `-` replaced by `_`. `casper:casper-test` becomes `CASPER_CASPER_TEST`.

```
CASPER_NETWORKS=casper:casper,casper:casper-test

SECRET_KEY_PEM_CASPER_CASPER=<pem A>
SECRET_KEY_ALGO_CASPER_CASPER=ed25519
RPCURL_CASPER_CASPER=https://node.mainnet.casper.network/rpc

SECRET_KEY_PEM_CASPER_CASPER_TEST=<pem B>
SECRET_KEY_ALGO_CASPER_CASPER_TEST=secp256k1
RPCURL_CASPER_CASPER_TEST=https://node.testnet.casper.network/rpc
```

Every network listed in `CASPER_NETWORKS` must provide its own
`SECRET_KEY_PEM_<NET>` and `RPCURL_<NET>` — there is no shared fallback.
`SECRET_KEY_ALGO_<NET>` is optional and defaults to `ed25519`. A network that
is missing either required variable produces a single startup error listing
every offender, so all misconfiguration is surfaced at once.

Implementation shape — the resolved map lives on `Env` with tag `env:"-"` so
the library skips it, and `Parse()` populates it before returning. The
post-parse step is also a natural place to perform any derivation that would
be awkward to express with struct tags (here, parsing the PEM into a typed
`PrivateKey`):

```go
type NetworkKey struct {
    SK     keypair.PrivateKey
    RPCURL string
}

type Env struct {
    Networks []string `env:"CASPER_NETWORKS"`

    // Populated by Parse(), keyed by the raw CAIP-2 network id.
    Keys map[string]NetworkKey `env:"-"`
}

func (e *Env) Parse() error {
    // ... godotenv + env.Parse ...
    return e.resolveKeys()
}

func (e *Env) resolveKeys() error {
    e.Keys = make(map[string]NetworkKey, len(e.Networks))
    var missing []string
    for _, net := range e.Networks {
        suffix := networkEnvSuffix(net) // uppercase, ':' and '-' -> '_'
        pem := os.Getenv("SECRET_KEY_PEM_" + suffix)
        rpc := os.Getenv("RPCURL_" + suffix)
        if pem == "" || rpc == "" {
            missing = append(missing, net)
            continue
        }
        // ... parse pem into a PrivateKey, then populate e.Keys[net]
    }
    if len(missing) > 0 {
        return fmt.Errorf("incomplete configurations for networks %v: ...", missing)
    }
    return nil
}
```

See [apps/facilitator/config.go](../apps/facilitator/config.go) for the full
implementation.

## Conventions and gotchas

- **Do not read `os.Getenv` from anywhere except `config.go`.** If a
  dependency needs a value, pass it as a function/constructor argument.
  This keeps the binary's environment surface documented in one place.
- **Keep `Env` flat.** Nested structs are supported by the library but make
  the config harder to scan; a flat struct of 10–20 fields is fine.
- **Defaults go in the struct, not in `main`.** That way `cfg.Port` is always
  usable — callers never need to re-check for zero values.
- **Required fields fail at startup, not at first use.** Prefer `,required`
  over runtime `if cfg.X == "" { ... }` checks scattered around the code.
- **Secrets travel through `Env` like anything else** (e.g.
  `SECRET_KEY_PEM_<NET>`). Never log the value; log a derived public
  identifier instead (public key hex, key ID, etc.).
- **One `Env` per binary.** Do not share a struct across `apps/*` and
  `examples/*` — divergent needs will make the shared struct awkward quickly.
