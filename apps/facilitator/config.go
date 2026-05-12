package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
	"github.com/make-software/casper-go-sdk/v2/types/keypair"
)

const EnvFile = ".env"
const DefaultAlgo = "ed25519"

// NetworkKey holds the resolved private-key material for a single network.
type NetworkKey struct {
	SK     keypair.PrivateKey
	RPCURL string
}

type Env struct {
	LogLevel string   `env:"LOG_LEVEL" envDefault:"info"`
	Port     int      `env:"PORT" envDefault:"4022"`
	Networks []string `env:"CASPER_NETWORKS" envDefault:"casper:casper-test"`

	// Keys is populated by Parse(). Keyed by the raw CAIP-2 network id
	// (e.g. "casper:casper-test").
	Keys map[string]NetworkKey `env:"-"`
}

func (e *Env) Parse() error {
	_ = godotenv.Load(EnvFile)

	if err := env.Parse(e); err != nil {
		return err
	}
	return e.resolveKeys()
}

// resolveKeys walks Networks and, for each, looks up a per-network
// SECRET_KEY_PEM_<NET> / SECRET_KEY_ALGO_<NET> pair, and RPCURL_<NET>.
// When missing, it returns an error.
// A network with no PEM available from either source is a fatal misconfig.
func (e *Env) resolveKeys() error {
	e.Keys = make(map[string]NetworkKey, len(e.Networks))
	var missing []string

	for _, raw := range e.Networks {
		net := strings.TrimSpace(raw)
		if net == "" {
			continue
		}
		suffix := networkEnvSuffix(net)

		pem := os.Getenv("SECRET_KEY_PEM_" + suffix)
		if pem == "" {
			missing = append(missing, net)
			continue
		}

		algo := os.Getenv("SECRET_KEY_ALGO_" + suffix)
		if algo == "" {
			algo = DefaultAlgo
		}

		rpcUrl := os.Getenv("RPCURL_" + suffix)
		if rpcUrl == "" {
			missing = append(missing, net)
			continue
		}

		sk, err := newPrivateKeyFromPEM(pem, algo)
		if err != nil {
			return fmt.Errorf("failed to load private key for network %q: %w", net, err)
		}

		e.Keys[net] = NetworkKey{SK: sk, RPCURL: rpcUrl}
	}

	if len(missing) > 0 {
		return fmt.Errorf(
			"incomplete configurations for networks %v: set SECRET_KEY_PEM_<NET>, and RPCURL_<NET> for each network, where <NET> is the CAIP-2 network id uppercased and with non-alphanumerics replaced by underscores (e.g. CASPER_CASPER_TEST for casper:casper-test).",
			missing,
		)
	}
	return nil
}

// networkEnvSuffix converts a CAIP-2 network id into the env-var suffix used
// to look up per-network overrides. Uppercases and replaces ":" and "-" with
// "_": "casper:casper-test" -> "CASPER_CASPER_TEST".
func networkEnvSuffix(network string) string {
	s := strings.ToUpper(network)
	s = strings.ReplaceAll(s, ":", "_")
	s = strings.ReplaceAll(s, "-", "_")
	return s
}

func newPrivateKeyFromPEM(pemStr string, algo string) (keypair.PrivateKey, error) {
	pemAlgo := keypair.ED25519
	switch algo {
	case "secp256k1":
		pemAlgo = keypair.SECP256K1
	case "", "ed25519":
		pemAlgo = keypair.ED25519
	default:
		return keypair.PrivateKey{}, fmt.Errorf("unknown key algorithm %q", algo)
	}
	normalizedPEM := strings.ReplaceAll(pemStr, `\n`, "\n")
	normalizedPEM = strings.ReplaceAll(normalizedPEM, "\r", "")
	return keypair.NewPrivateKeyFromPEM([]byte(normalizedPEM), pemAlgo)
}
