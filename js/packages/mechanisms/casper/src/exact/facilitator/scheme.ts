import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
  Network,
} from "@x402/core/types";
import { buildDomain, CASPER_DOMAIN_TYPES, hashTypedData } from "@casper-ecosystem/casper-eip-712";
import casperSdk from "casper-js-sdk";
import { SCHEME_EXACT } from "../../constants";
import { FacilitatorCasperSigner } from "../../signer";
import { ExactCasperPayload } from "../../types";
import { chainNameFromNetwork, isValidAddress, isValidContractPackageHash } from "../../utils";

const DEFAULT_PAYMENT_MOTES = 7_000_000_000;

/**
 * Decode a hex string into a Uint8Array.
 *
 * @param hex - Hex string, with or without "0x" prefix.
 * @returns Decoded bytes.
 * @throws Error if the hex string is invalid.
 */
function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (cleaned.length % 2 !== 0) {
    throw new Error("hex string must have an even number of characters");
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }
  return bytes;
}

const transferWithAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export const ErrInvalidScheme = "invalid_exact_casper_facilitator_invalid_scheme";
export const ErrNetworkMismatch = "invalid_exact_casper_facilitator_network_mismatch";
export const ErrInvalidAsset = "invalid_exact_casper_facilitator_invalid_asset";
export const ErrInvalidPayTo = "invalid_exact_casper_facilitator_invalid_payto";
export const ErrInvalidPayer = "invalid_exact_casper_facilitator_invalid_payer";
export const ErrAmountMismatch = "invalid_exact_casper_facilitator_amount_mismatch";
export const ErrPayToMismatch = "invalid_exact_casper_facilitator_payto_mismatch";
export const ErrExpired = "invalid_exact_casper_facilitator_expired";
export const ErrNotYetValid = "invalid_exact_casper_facilitator_not_yet_valid";
export const ErrInvalidSignature = "invalid_exact_casper_facilitator_invalid_signature";
export const ErrPublicKeyMismatch = "invalid_exact_casper_facilitator_publickey_mismatch";
export const ErrSettleFailed = "invalid_exact_casper_facilitator_settle_failed";
export const ErrMissingTokenName = "invalid_exact_casper_facilitator_missing_token_name";
export const ErrMissingTokenVersion = "invalid_exact_casper_facilitator_missing_token_version";
export const ErrFailedToHash = "invalid_exact_casper_facilitator_failed_to_hash";

export interface ExactCasperSchemeConfig {
  limitedPaymentMotes?: number;
}

/**
 * Casper facilitator implementation for the Exact payment scheme.
 */
export class ExactCasperScheme implements SchemeNetworkFacilitator {
  readonly scheme = SCHEME_EXACT;
  readonly caipFamily = "casper:*";

  /**
   * Creates a new ExactCasperScheme facilitator instance.
   *
   * @param signer - The Casper signer for facilitator operations
   * @param config - Optional facilitator configuration
   */
  constructor(
    private readonly signer: FacilitatorCasperSigner,
    private readonly config?: ExactCasperSchemeConfig,
  ) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   *
   * @param network - The network identifier
   * @returns Extra data object with feePayer
   */
  getExtra(network: Network): Record<string, unknown> {
    const addresses = this.signer.getAddresses(network);
    return {
      feePayer: addresses[0] ?? "",
    };
  }

  /**
   * Get signer addresses used by this facilitator for a given network.
   *
   * @param network - The network identifier
   * @returns Array of signer addresses
   */
  getSigners(network: Network): string[] {
    return this.signer.getAddresses(network);
  }

  /**
   * Verify a Casper Exact payment payload.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @param _ - Optional facilitator context
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    if (payload.accepted.scheme !== SCHEME_EXACT || requirements.scheme !== SCHEME_EXACT) {
      return { isValid: false, invalidReason: ErrInvalidScheme };
    }

    if (payload.accepted.network !== requirements.network) {
      return {
        isValid: false,
        invalidReason: ErrNetworkMismatch,
        invalidMessage: `payload=${payload.accepted.network} requirements=${requirements.network}`,
      };
    }

    let p: ExactCasperPayload;
    try {
      p = payload.payload as ExactCasperPayload;
      if (
        !p.signature ||
        !p.publicKey ||
        !p.authorization.from ||
        !p.authorization.to ||
        p.authorization.value === undefined ||
        !p.authorization.validAfter ||
        !p.authorization.validBefore ||
        !p.authorization.nonce
      ) {
        throw new Error("missing payload fields");
      }
    } catch {
      return {
        isValid: false,
        invalidReason: ErrInvalidScheme,
        invalidMessage: "malformed payload",
      };
    }

    const payer = p.authorization.from;

    if (p.authorization.to !== requirements.payTo) {
      return {
        isValid: false,
        invalidReason: ErrPayToMismatch,
        invalidMessage: `authorization.to=${p.authorization.to} requirements.payTo=${requirements.payTo}`,
        payer,
      };
    }

    if (p.authorization.value !== requirements.amount) {
      return {
        isValid: false,
        invalidReason: ErrAmountMismatch,
        invalidMessage: `authorization.value=${p.authorization.value} requirements.amount=${requirements.amount}`,
        payer,
      };
    }

    if (!isValidAddress(requirements.payTo) || !isValidAddress(p.authorization.to)) {
      return { isValid: false, invalidReason: ErrInvalidPayTo, payer };
    }

    if (!isValidAddress(payer)) {
      return { isValid: false, invalidReason: ErrInvalidPayer, payer };
    }

    if (
      requirements.amount === "" ||
      requirements.amount === "0" ||
      p.authorization.value === "" ||
      p.authorization.value === "0"
    ) {
      return {
        isValid: false,
        invalidReason: ErrAmountMismatch,
        invalidMessage: "amount must be non-zero",
        payer,
      };
    }

    if (!isValidContractPackageHash(requirements.asset)) {
      return {
        isValid: false,
        invalidReason: ErrInvalidAsset,
        invalidMessage: requirements.asset,
        payer,
      };
    }

    let validAfter: number;
    let validBefore: number;
    try {
      validAfter = parseInt(p.authorization.validAfter, 10);
      validBefore = parseInt(p.authorization.validBefore, 10);
      if (isNaN(validAfter) || isNaN(validBefore)) {
        throw new Error("invalid timestamp");
      }
    } catch {
      return {
        isValid: false,
        invalidReason: ErrInvalidScheme,
        invalidMessage: "invalid validAfter/validBefore",
        payer,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    if (validAfter > now) {
      return {
        isValid: false,
        invalidReason: ErrNotYetValid,
        invalidMessage: `validAfter=${validAfter} > now=${now}`,
        payer,
      };
    }
    if (now > validBefore) {
      return {
        isValid: false,
        invalidReason: ErrExpired,
        invalidMessage: `validBefore=${validBefore} < now=${now}`,
        payer,
      };
    }
    if (validBefore - now < 6) {
      return {
        isValid: false,
        invalidReason: ErrExpired,
        invalidMessage: "less than 6s to settle",
        payer,
      };
    }

    const name = requirements.extra?.name;
    const version = requirements.extra?.version;
    if (typeof name !== "string" || name === "") {
      return { isValid: false, invalidReason: ErrMissingTokenName, payer };
    }
    if (typeof version !== "string" || version === "") {
      return { isValid: false, invalidReason: ErrMissingTokenVersion, payer };
    }

    try {
      await this.signer.getNetworkConfig(requirements.network);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isValid: false, invalidReason: ErrNetworkMismatch, invalidMessage: message, payer };
    }

    let digest: Uint8Array;
    try {
      const domain = buildDomain(name, version, requirements.network, "0x" + requirements.asset);

      const nonceBytes = hexToBytes(p.authorization.nonce);
      if (nonceBytes.length !== 32) {
        return {
          isValid: false,
          invalidReason: ErrInvalidSignature,
          invalidMessage: "nonce must be 32 bytes",
          payer,
        };
      }

      const message = {
        from: "0x" + payer,
        to: "0x" + p.authorization.to,
        value: BigInt(p.authorization.value),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: "0x" + p.authorization.nonce,
      };

      digest = hashTypedData(
        domain,
        transferWithAuthorizationTypes,
        "TransferWithAuthorization",
        message,
        {
          domainTypes: CASPER_DOMAIN_TYPES,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isValid: false, invalidReason: ErrFailedToHash, invalidMessage: message, payer };
    }

    let publicKey: casperSdk.PublicKey;
    try {
      publicKey = casperSdk.PublicKey.fromHex(p.publicKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isValid: false, invalidReason: ErrInvalidSignature, invalidMessage: message, payer };
    }

    if (publicKey.accountHash().toHex() !== payer.slice(2)) {
      return {
        isValid: false,
        invalidReason: ErrPublicKeyMismatch,
        invalidMessage: "public key does not match authorization.from",
        payer,
      };
    }

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = hexToBytes(p.signature);
      if (signatureBytes.length !== 65) {
        return {
          isValid: false,
          invalidReason: ErrInvalidSignature,
          invalidMessage: "signature must be 65 bytes",
          payer,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isValid: false, invalidReason: ErrInvalidSignature, invalidMessage: message, payer };
    }

    try {
      if (!publicKey.verifySignature(digest, signatureBytes)) {
        return {
          isValid: false,
          invalidReason: ErrInvalidSignature,
          invalidMessage: "signature verification failed",
          payer,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { isValid: false, invalidReason: ErrInvalidSignature, invalidMessage: message, payer };
    }

    return { isValid: true, payer };
  }

  /**
   * Settle a Casper Exact payment payload.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @param context - Optional facilitator context
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const network = requirements.network;

    const verifyResp = await this.verify(payload, requirements, context);
    if (!verifyResp.isValid) {
      return {
        success: false,
        errorReason: verifyResp.invalidReason,
        errorMessage: verifyResp.invalidMessage,
        payer: verifyResp.payer,
        transaction: "",
        network,
      };
    }

    const p = payload.payload as ExactCasperPayload;

    let publicKeyHex: string;
    try {
      publicKeyHex = this.signer.getPublicKeyHex(network);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errorReason: ErrSettleFailed,
        errorMessage: message,
        payer: verifyResp.payer,
        transaction: "",
        network,
      };
    }

    let facilitatorPublicKey: casperSdk.PublicKey;
    try {
      facilitatorPublicKey = casperSdk.PublicKey.fromHex(publicKeyHex);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errorReason: ErrSettleFailed,
        errorMessage: message,
        payer: verifyResp.payer,
        transaction: "",
        network,
      };
    }

    let networkConfig;
    try {
      networkConfig = await this.signer.getNetworkConfig(network);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errorReason: ErrNetworkMismatch,
        errorMessage: message,
        payer: verifyResp.payer,
        transaction: "",
        network,
      };
    }

    try {
      const args = buildTransferWithAuthorizationArgs(p);

      const transaction = new casperSdk.ContractCallBuilder()
        .from(facilitatorPublicKey)
        .byPackageHash(requirements.asset)
        .entryPoint("transfer_with_authorization")
        .runtimeArgs(args)
        .chainName(chainNameFromNetwork(networkConfig.chainName))
        .payment(this.config?.limitedPaymentMotes ?? DEFAULT_PAYMENT_MOTES)
        .build();

      await this.signer.signTransaction(transaction, network);
      const transactionHash = await this.signer.putTransaction(network, transaction);
      await this.signer.waitForTransaction(network, transactionHash);

      return {
        success: true,
        transaction: transactionHash,
        network,
        payer: verifyResp.payer,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errorReason: ErrSettleFailed,
        errorMessage: message,
        payer: verifyResp.payer,
        transaction: "",
        network,
      };
    }
  }
}

/**
 * Build runtime args for the transfer_with_authorization entry point.
 *
 * @param payload - The Exact Casper payload
 * @returns Casper Args
 */
function buildTransferWithAuthorizationArgs(payload: ExactCasperPayload) {
  const fromKey = casperSdk.Key.newKey("account-hash-" + payload.authorization.from.slice(2));
  const toKey = casperSdk.Key.newKey("account-hash-" + payload.authorization.to.slice(2));
  const signatureBytes = hexToBytes(payload.signature);
  const nonceBytes = hexToBytes(payload.authorization.nonce);
  const publicKey = casperSdk.PublicKey.fromHex(payload.publicKey);

  const args: Record<string, casperSdk.CLValue> = {
    from: casperSdk.CLValue.newCLKey(fromKey),
    to: casperSdk.CLValue.newCLKey(toKey),
    value: casperSdk.CLValue.newCLUInt256(payload.authorization.value),
    valid_after: casperSdk.CLValue.newCLUint64(parseInt(payload.authorization.validAfter, 10)),
    valid_before: casperSdk.CLValue.newCLUint64(parseInt(payload.authorization.validBefore, 10)),
    nonce: casperSdk.CLValue.newCLList(
      casperSdk.CLTypeUInt8,
      Array.from(nonceBytes).map(b => casperSdk.CLValue.newCLUint8(b)),
    ),
    public_key: casperSdk.CLValue.newCLPublicKey(publicKey),
    signature: casperSdk.CLValue.newCLList(
      casperSdk.CLTypeUInt8,
      Array.from(signatureBytes).map(b => casperSdk.CLValue.newCLUint8(b)),
    ),
  };

  return casperSdk.Args.fromMap(args);
}
