import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { FacilitatorCasperSigner } from "../../signer";
import { ExactCasperScheme } from "./scheme";

/**
 * Configuration options for registering Casper schemes to an x402Facilitator.
 */
export interface CasperFacilitatorConfig {
  /**
   * The Casper signer for facilitator operations (verify and settle).
   */
  signer: FacilitatorCasperSigner;

  /**
   * Networks to register (single network or array of networks).
   * Examples: "casper:casper-test", ["casper:casper-test", "casper:casper"]
   */
  networks: Network | Network[];

  /**
   * Payment amount in motes for settlement transactions.
   *
   * @default 7_000_000_000
   */
  limitedPaymentMotes?: number;
}

/**
 * Registers Casper exact payment schemes to an x402Facilitator instance.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for Casper facilitator registration
 * @returns The facilitator instance for chaining
 */
export function registerExactCasperScheme(
  facilitator: x402Facilitator,
  config: CasperFacilitatorConfig,
): x402Facilitator {
  facilitator.register(
    config.networks,
    new ExactCasperScheme(config.signer, {
      limitedPaymentMotes: config.limitedPaymentMotes,
    }),
  );

  return facilitator;
}
