// Command client demonstrates making an x402 micropayment to a Casper resource server.
//
// Configuration via environment variables (or .env file):
//
//	CLIENT_PRIVATE_KEY_PATH - path to PEM private key file (required)
//	CLIENT_KEY_ALGO         - key algorithm: "ed25519" or "secp256k1" (default "ed25519")
//	SERVER_URL              - resource server URL (default "http://localhost:4021")
//	CAIP2_CHAIN_ID          - Casper network CAIP-2 ID, e.g. "casper:casper-net-1" (required)
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	x402 "github.com/x402-foundation/x402/go"
	x402http "github.com/x402-foundation/x402/go/http"

	casperClientScheme "casper_x402_facilitator/x402/mechanisms/casper/exact/client"
	casperSigner "casper_x402_facilitator/x402/signers/casper"
)

func main() {
	var cfg Env
	if err := cfg.Parse(); err != nil {
		log.Fatalf("Error parsing configuration: %v", err)
	}

	signer, err := casperSigner.NewClientSignerFromKeyFile(cfg.PrivateKeyPath, cfg.KeyAlgo)
	if err != nil {
		log.Fatalf("failed to create signer: %v", err)
	}

	fmt.Printf("Client address: %s\n", signer.AccountAddress())
	fmt.Printf("Network:        %s\n", cfg.ChainID)
	fmt.Printf("Server:         %s\n", cfg.ServerURL)

	scheme := casperClientScheme.NewExactCasperScheme(signer)

	x402Client := x402.Newx402Client()
	x402Client.Register(x402.Network(cfg.ChainID), scheme)

	httpClient := x402http.WrapHTTPClientWithPayment(
		http.DefaultClient,
		x402http.Newx402HTTPClient(x402Client),
	)

	fmt.Println("\nRequesting /weather (payment will be made automatically if required)...")

	resp, err := httpClient.Get(cfg.ServerURL + "/weather?city=San%20Francisco")
	if err != nil {
		log.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatalf("failed to read response body: %v", err)
	}

	fmt.Printf("Status: %d\n", resp.StatusCode)

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("Response: %s\n", string(body))
		return
	}

	fmt.Printf("City:        %v\n", result["city"])
	fmt.Printf("Weather:     %v\n", result["weather"])
	fmt.Printf("Temperature: %v\n", result["temperature"])
	fmt.Printf("Timestamp:   %v\n", result["timestamp"])
}
