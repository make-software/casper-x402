package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/make-software/casper-go-sdk/v2/types/keypair"

	casperFacilitator "casper_x402_facilitator/x402/mechanisms/casper/exact/facilitator"
	casperSigner "casper_x402_facilitator/x402/signers/casper"

	"casper_x402_facilitator/internal/logger"
	"casper_x402_facilitator/internal/logger/ginmw"

	x402 "github.com/x402-foundation/x402/go"
)

// fatal logs an error at the error level and exits with code 1.
// Replaces stdlib log.Fatal/Fatalf so fatal startup errors stay structured.
func fatal(msg string, kv ...any) {
	logger.Default().Error(msg, kv...)
	os.Exit(1)
}

func main() {

	var cfg Env
	if err := cfg.Parse(); err != nil {
		panic(fmt.Sprintf("Error parsing configuration: %v", err))
	}

	log := logger.Default()

	var networks []x402.Network
	for _, n := range cfg.Networks {
		n = strings.TrimSpace(n)
		if n != "" {
			networks = append(networks, x402.Network(n))
		}
	}
	if len(networks) == 0 {
		fatal("no networks configured")
	}

	keys := make(map[string]keypair.PrivateKey)
	rpcURLs := make(map[string]string)

	for _, net := range networks {
		netStr := string(net)

		nk, ok := cfg.Keys[netStr]
		if !ok {
			fatal("no private key resolved for network", "network", netStr)
		}
		keys[netStr] = nk.SK
		rpcURLs[netStr] = nk.RPCURL

		log.Info("network configured",
			"network", netStr,
			"public_key", nk.SK.PublicKey().ToHex(),
			"rpc_url", rpcURLs[netStr],
		)
	}

	signer := casperSigner.NewFacilitatorSigner(keys, rpcURLs)
	facilitator := x402.Newx402Facilitator()
	facilitator.Register(networks, casperFacilitator.NewExactCasperScheme(signer, nil))

	facilitator.OnAfterVerify(func(hookCtx x402.FacilitatorVerifyResultContext) error {
		logger.Ctx(hookCtx.Ctx).With(logger.FieldType, logger.TypeX402).Info("verify completed",
			"valid", hookCtx.Result.IsValid,
			"network", hookCtx.Requirements.GetNetwork(),
			"payer", hookCtx.Result.Payer,
			"invalid_reason", hookCtx.Result.InvalidReason,
		)
		return nil
	})
	facilitator.OnAfterSettle(func(hookCtx x402.FacilitatorSettleResultContext) error {
		logger.Ctx(hookCtx.Ctx).With(logger.FieldType, logger.TypeX402).Info("settle completed",
			"success", hookCtx.Result.Success,
			"tx_hash", hookCtx.Result.Transaction,
			"network", hookCtx.Result.Network,
			"payer", hookCtx.Result.Payer,
		)
		return nil
	})

	gin.DebugPrintFunc = func(format string, values ...any) {
		log.Debug(fmt.Sprintf(format, values...), logger.FieldType, "gin")
	}
	r := gin.New()
	r.Use(ginmw.RequestID(log))
	r.Use(ginmw.AccessLog())
	r.Use(gin.Recovery())

	r.GET("/supported", handleSupported(facilitator))
	r.POST("/verify", handleVerify(facilitator))
	r.POST("/settle", handleSettle(facilitator))
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	log.Info("server starting", "port", cfg.Port)
	if err := r.Run(fmt.Sprintf(":%d", cfg.Port)); err != nil {
		fatal("server error", "error", err.Error())
	}
}

// ============================================================================
// HTTP Handlers
// ============================================================================

func handleSupported(facilitator *x402.X402Facilitator) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, facilitator.GetSupported())
	}
}

func handleVerify(facilitator *x402.X402Facilitator) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		log := logger.Ctx(ctx)

		var req struct {
			PaymentPayload      json.RawMessage `json:"paymentPayload"`
			PaymentRequirements json.RawMessage `json:"paymentRequirements"`
		}
		if err := c.BindJSON(&req); err != nil {
			log.Warn("verify: invalid request body", "error", err.Error())
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		result, err := facilitator.Verify(ctx, req.PaymentPayload, req.PaymentRequirements)
		if err != nil {
			var verifyErr *x402.VerifyError
			if errors.As(err, &verifyErr) {
				log.Warn("verify: invalid payment",
					"invalid_reason", verifyErr.InvalidReason,
					"invalid_message", verifyErr.InvalidMessage,
					"payer", verifyErr.Payer,
				)
				c.JSON(http.StatusOK, x402.VerifyResponse{
					IsValid:        false,
					InvalidReason:  verifyErr.InvalidReason,
					InvalidMessage: verifyErr.InvalidMessage,
					Payer:          verifyErr.Payer,
				})
				return
			}
			log.Error("verify: unexpected error", "error", err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, result)
	}
}

func handleSettle(facilitator *x402.X402Facilitator) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
		defer cancel()

		log := logger.Ctx(ctx)

		var req struct {
			PaymentPayload      json.RawMessage `json:"paymentPayload"`
			PaymentRequirements json.RawMessage `json:"paymentRequirements"`
		}
		if err := c.BindJSON(&req); err != nil {
			log.Warn("settle: invalid request body", "error", err.Error())
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		result, err := facilitator.Settle(ctx, req.PaymentPayload, req.PaymentRequirements)
		if err != nil {
			var settleErr *x402.SettleError
			if errors.As(err, &settleErr) {
				log.Warn("settle: failed",
					"error_reason", settleErr.ErrorReason,
					"error_message", settleErr.ErrorMessage,
					"tx_hash", settleErr.Transaction,
					"network", settleErr.Network,
					"payer", settleErr.Payer,
				)
				c.JSON(http.StatusOK, x402.SettleResponse{
					Success:      false,
					ErrorReason:  settleErr.ErrorReason,
					ErrorMessage: settleErr.ErrorMessage,
					Transaction:  settleErr.Transaction,
					Network:      settleErr.Network,
					Payer:        settleErr.Payer,
				})
				return
			}
			log.Error("settle: unexpected error", "error", err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, result)
	}
}
