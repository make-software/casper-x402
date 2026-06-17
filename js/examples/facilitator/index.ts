import { x402Facilitator } from "@x402/core/facilitator";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/facilitator";
import { createFacilitatorCasperSigner } from "@make-software/casper-x402";
import dotenv from "dotenv";
import express from "express";
import casperSdk from "casper-js-sdk";

dotenv.config();

// Configuration
const casperPrivateKeyPath = process.env.CASPER_PRIVATE_KEY_PATH as string | undefined;
const casperKeyAlgorithm = process.env.CASPER_KEY_ALGORITHM as string | undefined;
const PORT = process.env.PORT || "4022";

if (!casperPrivateKeyPath) {
  console.error("❌ CASPER_PRIVATE_KEY_PATH environment variable is required");
  process.exit(1);
}

if (!casperKeyAlgorithm) {
  console.error("❌ CASPER_KEY_ALGORITHM environment variable is required");
  process.exit(1);
}

if (casperKeyAlgorithm !== "ed25519" && casperKeyAlgorithm !== "secp256k1") {
  console.error("❌ CASPER_KEY_ALGORITHM must be either 'ed25519' or 'secp256k1'");
  process.exit(1);
}

// Initialize the x402 Facilitator with Casper support
const algorithm =
  casperKeyAlgorithm === "secp256k1"
    ? casperSdk.KeyAlgorithm.SECP256K1
    : casperSdk.KeyAlgorithm.ED25519;
const casperSigner = await createFacilitatorCasperSigner(
  casperPrivateKeyPath,
  algorithm,
  process.env.CASPER_RPC_URL as string,
);

const facilitator = new x402Facilitator()
  .onBeforeVerify(async context => {
    console.log("Before verify", context);
  })
  .onAfterVerify(async context => {
    console.log("After verify", context);
  })
  .onVerifyFailure(async context => {
    console.log("Verify failure", context);
  })
  .onBeforeSettle(async context => {
    console.log("Before settle", context);
  })
  .onAfterSettle(async context => {
    console.log("After settle", context);
  })
  .onSettleFailure(async context => {
    console.log("Settle failure", context);
  });

// Register Casper scheme
facilitator.register(
  "casper:casper-test",
  new ExactCasperScheme(casperSigner, {
    limitedPaymentMotes: 6_000_000_000, // 6 CSPR in motes;
  }),
);

// Initialize Express app
const app = express();
app.use(express.json());

/**
 * POST /verify
 * Verify a payment against requirements
 *
 * Note: Payment tracking and bazaar discovery are handled by lifecycle hooks
 */
app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    // Hooks will automatically:
    // - Track verified payment (onAfterVerify)
    // - Extract and catalog discovery info (onAfterVerify)
    const response: VerifyResponse = await facilitator.verify(paymentPayload, paymentRequirements);

    res.json(response);
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /settle
 * Settle a payment on-chain
 *
 * Note: Verification validation and cleanup are handled by lifecycle hooks
 */
app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    // Hooks will automatically:
    // - Validate payment was verified (onBeforeSettle - will abort if not)
    // - Check verification timeout (onBeforeSettle)
    // - Clean up tracking (onAfterSettle / onSettleFailure)
    const response: SettleResponse = await facilitator.settle(
      paymentPayload as PaymentPayload,
      paymentRequirements as PaymentRequirements,
    );

    res.json(response);
  } catch (error) {
    console.error("Settle error:", error);

    // Check if this was an abort from hook
    if (error instanceof Error && error.message.includes("Settlement aborted:")) {
      // Return a proper SettleResponse instead of 500 error
      return res.json({
        success: false,
        errorReason: error.message.replace("Settlement aborted: ", ""),
        network: req.body?.paymentPayload?.network || "unknown",
      } as SettleResponse);
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /supported
 * Get supported payment kinds and extensions
 */
app.get("/supported", async (req, res) => {
  try {
    const response = facilitator.getSupported();
    res.json(response);
  } catch (error) {
    console.error("Supported error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Start the server
app.listen(parseInt(PORT), () => {
  console.log(`🚀 Facilitator listening on http://localhost:${PORT}`);
  console.log();
});
