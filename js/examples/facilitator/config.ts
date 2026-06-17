// Mirrors go/examples/facilitator/config.go: same env-var names, same
// per-network suffix scheme, same multi-network resolution. The Env struct
// is built by parseEnv(); callers should never read process.env directly.

import type { Network } from "@x402/core/types";

export type KeyAlgorithm = "ed25519" | "secp256k1";

export const EnvFile = ".env";
export const DefaultAlgorithm: KeyAlgorithm = "ed25519";

/** Resolved per-network signing material. */
export interface NetworkKey {
  /** PEM-encoded private-key content (newlines normalized). */
  pem: string;
  /** Algorithm used to parse the PEM. */
  algorithm: KeyAlgorithm;
  /** JSON-RPC endpoint for the Casper node on this network. */
  rpcUrl: string;
}

export interface Env {
  logLevel: string;
  port: number;
  /** CAIP-2 network IDs this facilitator will accept. */
  networks: Network[];
  /** Gas budget (motes) for each settlement transaction. */
  transactionPaymentMotes: number;
  /**
   * Resolved signing material, keyed by raw CAIP-2 network id
   * (e.g. "casper:casper-test"). Populated by parseEnv().
   */
  keys: Record<string, NetworkKey>;
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`${key} environment variable is required`);
  }
  return v;
}

/**
 * Convert a CAIP-2 network id to the env-var suffix used for per-network
 * overrides. Uppercases and replaces ":" and "-" with "_":
 *   "casper:casper-test" -> "CASPER_CASPER_TEST".
 */
export function networkEnvSuffix(network: string): string {
  return network.toUpperCase().replace(/[:\-]/g, "_");
}

/** Normalize a PEM string: support escaped "\n" and strip carriage returns. */
export function normalizePEM(pem: string): string {
  return pem.replace(/\\n/g, "\n").replace(/\r/g, "");
}

export function parseEnv(): Env {
  // ---- Global variables --------------------------------------------------
  const logLevel = process.env.LOG_LEVEL || "info";

  const portRaw = process.env.PORT || "4022";
  const port = parseInt(portRaw, 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid port number, got ${portRaw}`);
  }

  const networksRaw = process.env.CASPER_NETWORKS || "casper:casper-test";
  const networks = networksRaw
    .split(",")
    .map(n => n.trim())
    .filter(n => n.length > 0) as Network[];

  if (networks.length === 0) {
    throw new Error(
      "CASPER_NETWORKS must list at least one network (comma-separated CAIP-2 ids)",
    );
  }

  const transactionPaymentMotesRaw =
    process.env.TRANSACTION_PAYMENT_MOTES || "7000000000";
  const transactionPaymentMotes = parseInt(transactionPaymentMotesRaw, 10);
  if (Number.isNaN(transactionPaymentMotes) || transactionPaymentMotes <= 0) {
    throw new Error(
      `TRANSACTION_PAYMENT_MOTES must be a positive integer, got ${transactionPaymentMotesRaw}`,
    );
  }

  // ---- Per-network resolution -------------------------------------------
  const keys: Record<string, NetworkKey> = {};
  const missing: string[] = [];

  for (const net of networks) {
    const suffix = networkEnvSuffix(net);

    const pemRaw = process.env[`SECRET_KEY_PEM_${suffix}`];
    const rpcUrl = process.env[`RPCURL_${suffix}`];

    if (!pemRaw || !rpcUrl) {
      missing.push(net);
      continue;
    }

    const algoRaw = (
      process.env[`SECRET_KEY_ALGO_${suffix}`] || DefaultAlgorithm
    ).toLowerCase();
    if (algoRaw !== "ed25519" && algoRaw !== "secp256k1") {
      throw new Error(
        `SECRET_KEY_ALGO_${suffix} must be 'ed25519' or 'secp256k1', got '${algoRaw}'`,
      );
    }

    keys[net] = {
      pem: normalizePEM(pemRaw),
      algorithm: algoRaw,
      rpcUrl,
    };
  }

  if (missing.length > 0) {
    throw new Error(
      `Incomplete configurations for networks ${missing.join(", ")}: set SECRET_KEY_PEM_<NET> and RPCURL_<NET> for each network, where <NET> is the CAIP-2 network id uppercased with ':' and '-' replaced by '_' (e.g. CASPER_CASPER_TEST for casper:casper-test).`,
    );
  }

  return {
    logLevel,
    port,
    networks,
    transactionPaymentMotes,
    keys,
  };
}
