import casperSdk from "casper-js-sdk";
import type { TransactionV1 } from "casper-js-sdk";

const { KeyAlgorithm, PrivateKey } = casperSdk;
import { describe, expect, it } from "vitest";
import { ExactCasperScheme } from "../../../src/exact/facilitator/scheme";
import {
  ErrAmountMismatch,
  ErrExpired,
  ErrInvalidAsset,
  ErrInvalidPayTo,
  ErrInvalidScheme,
  ErrInvalidSignature,
  ErrNetworkMismatch,
  ErrNotYetValid,
  ErrPayToMismatch,
  ErrPublicKeyMismatch,
  ErrSettleFailed,
} from "../../../src/exact/facilitator/scheme";
import { ExactCasperScheme as ClientExactCasperScheme } from "../../../src/exact/client/scheme";
import { FacilitatorCasperSigner } from "../../../src/signer";
import { toClientCasperSigner } from "../../../src/signer";
import { ExactCasperPayload } from "../../../src/types";

const testAsset = "aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788";
const testPayTo = "00aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788";
const testNetwork = "casper:casper-test";

function createMockSigner(overrides?: {
  signTransaction?: () => Promise<void>;
  putTransaction?: () => Promise<string>;
  waitForTransaction?: () => Promise<void>;
}): FacilitatorCasperSigner {
  const privateKey = PrivateKey.generate(KeyAlgorithm.ED25519);

  return {
    getNetworkConfig: async () => ({
      chainName: "casper-test",
      rpcUrl: "http://localhost:11101/rpc",
    }),
    getAddresses: () => [privateKey.publicKey.accountHash().toHex()],
    getPublicKeyHex: () => privateKey.publicKey.toHex(),
    signTransaction: overrides?.signTransaction ?? (async () => {}),
    putTransaction: overrides?.putTransaction ?? (async () => "transaction-hash"),
    waitForTransaction: overrides?.waitForTransaction ?? (async () => {}),
  };
}

async function createValidPayload(): Promise<{
  payload: ExactCasperPayload;
  payerAddress: string;
}> {
  const privateKey = PrivateKey.generate(KeyAlgorithm.ED25519);
  const clientSigner = toClientCasperSigner(privateKey);
  const clientScheme = new ClientExactCasperScheme(clientSigner);

  const requirements = {
    scheme: "exact" as const,
    network: testNetwork,
    asset: testAsset,
    amount: "1000000",
    payTo: testPayTo,
    maxTimeoutSeconds: 300,
    extra: {
      name: "TestToken",
      version: "1",
    },
  };

  const result = await clientScheme.createPaymentPayload(2, requirements);
  return {
    payload: result.payload as ExactCasperPayload,
    payerAddress: clientSigner.accountAddress(),
  };
}

function buildPaymentPayload(payload: ExactCasperPayload): {
  x402Version: number;
  accepted: {
    scheme: "exact";
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
  };
  payload: Record<string, unknown>;
} {
  return {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: testNetwork,
      asset: testAsset,
      amount: "1000000",
      payTo: testPayTo,
      maxTimeoutSeconds: 300,
      extra: {
        name: "TestToken",
        version: "1",
      },
    },
    payload: payload as unknown as Record<string, unknown>,
  };
}

function buildRequirements(
  overrides?: Partial<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    extra: Record<string, unknown>;
  }>,
): {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
} {
  return {
    scheme: "exact",
    network: testNetwork,
    asset: testAsset,
    amount: "1000000",
    payTo: testPayTo,
    maxTimeoutSeconds: 300,
    extra: {
      name: "TestToken",
      version: "1",
    },
    ...overrides,
  };
}

describe("ExactCasperScheme facilitator", () => {
  describe("getExtra", () => {
    it("returns feePayer and publicKey", async () => {
      const signer = createMockSigner();
      const scheme = new ExactCasperScheme(signer);

      const extra = scheme.getExtra(testNetwork);
      const addresses = signer.getAddresses(testNetwork);

      expect(extra).toEqual({ feePayer: addresses[0] });
    });

    it("returns empty string feePayer when signer has no addresses", async () => {
      const signer = createMockSigner();
      signer.getAddresses = () => [];
      const scheme = new ExactCasperScheme(signer);

      const extra = scheme.getExtra(testNetwork);

      expect(extra).toEqual({ feePayer: "" });
    });
  });

  describe("getSigners", () => {
    it("returns signer addresses", async () => {
      const signer = createMockSigner();
      const scheme = new ExactCasperScheme(signer);

      const addresses = await scheme.getSigners(testNetwork);

      expect(addresses).toEqual(signer.getAddresses(testNetwork));
    });
  });

  describe("verify", () => {
    it("returns valid for a correct payload", async () => {
      const { payload } = await createValidPayload();
      const scheme = new ExactCasperScheme(createMockSigner());

      const result = await scheme.verify(buildPaymentPayload(payload), buildRequirements());

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe(payload.authorization.from);
    });

    it("rejects wrong scheme", async () => {
      const { payload } = await createValidPayload();
      const scheme = new ExactCasperScheme(createMockSigner());

      const result = await scheme.verify(
        buildPaymentPayload(payload),
        buildRequirements({ scheme: "upto" }),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrInvalidScheme);
    });

    it("rejects network mismatch", async () => {
      const { payload } = await createValidPayload();
      const scheme = new ExactCasperScheme(createMockSigner());

      const result = await scheme.verify(
        buildPaymentPayload(payload),
        buildRequirements({ network: "casper:other" }),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrNetworkMismatch);
    });

    it("rejects payTo mismatch", async () => {
      const { payload } = await createValidPayload();
      const scheme = new ExactCasperScheme(createMockSigner());

      const result = await scheme.verify(
        buildPaymentPayload(payload),
        buildRequirements({ payTo: "00".padEnd(66, "0") }),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrPayToMismatch);
    });

    it("rejects amount mismatch", async () => {
      const { payload } = await createValidPayload();
      const scheme = new ExactCasperScheme(createMockSigner());

      const result = await scheme.verify(
        buildPaymentPayload(payload),
        buildRequirements({ amount: "2000000" }),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrAmountMismatch);
    });

    it("rejects expired authorization", async () => {
      const { payload } = await createValidPayload();
      payload.authorization.validBefore = String(Math.floor(Date.now() / 1000) - 10);
      payload.authorization.validAfter = String(Math.floor(Date.now() / 1000) - 100);

      const scheme = new ExactCasperScheme(createMockSigner());
      const result = await scheme.verify(buildPaymentPayload(payload), buildRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrExpired);
    });

    it("rejects not yet valid authorization", async () => {
      const { payload } = await createValidPayload();
      payload.authorization.validAfter = String(Math.floor(Date.now() / 1000) + 100);
      payload.authorization.validBefore = String(Math.floor(Date.now() / 1000) + 200);

      const scheme = new ExactCasperScheme(createMockSigner());
      const result = await scheme.verify(buildPaymentPayload(payload), buildRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrNotYetValid);
    });

    it("rejects when public key does not match authorization.from", async () => {
      const { payload } = await createValidPayload();
      const otherKey = PrivateKey.generate(KeyAlgorithm.ED25519);
      payload.publicKey = otherKey.publicKey.toHex();

      const scheme = new ExactCasperScheme(createMockSigner());
      const result = await scheme.verify(buildPaymentPayload(payload), buildRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrPublicKeyMismatch);
    });

    it("rejects invalid signature", async () => {
      const { payload } = await createValidPayload();
      payload.signature = "01" + "0".repeat(128);

      const scheme = new ExactCasperScheme(createMockSigner());
      const result = await scheme.verify(buildPaymentPayload(payload), buildRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrInvalidSignature);
    });

    it("rejects invalid asset", async () => {
      const { payload } = await createValidPayload();
      const scheme = new ExactCasperScheme(createMockSigner());

      const result = await scheme.verify(
        buildPaymentPayload(payload),
        buildRequirements({ asset: "bad" }),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrInvalidAsset);
    });

    it("rejects invalid payTo", async () => {
      const { payload } = await createValidPayload();
      payload.authorization.to = "bad";
      const scheme = new ExactCasperScheme(createMockSigner());

      const result = await scheme.verify(
        buildPaymentPayload(payload),
        buildRequirements({ payTo: "bad" }),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrInvalidPayTo);
    });
  });

  describe("settle", () => {
    it("returns success for a valid payload", async () => {
      const { payload } = await createValidPayload();
      const signer = createMockSigner();
      const scheme = new ExactCasperScheme(signer);

      const result = await scheme.settle(buildPaymentPayload(payload), buildRequirements());

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("transaction-hash");
      expect(result.network).toBe(testNetwork);
      expect(result.payer).toBe(payload.authorization.from);
    });

    it("fails when verify fails", async () => {
      const { payload } = await createValidPayload();
      const scheme = new ExactCasperScheme(createMockSigner());

      const result = await scheme.settle(
        buildPaymentPayload(payload),
        buildRequirements({ amount: "2000000" }),
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrAmountMismatch);
    });

    it("fails when putTransaction fails", async () => {
      const { payload } = await createValidPayload();
      const signer = createMockSigner({
        putTransaction: async () => {
          throw new Error("rpc error");
        },
      });
      const scheme = new ExactCasperScheme(signer);

      const result = await scheme.settle(buildPaymentPayload(payload), buildRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrSettleFailed);
      expect(result.errorMessage).toContain("rpc error");
    });

    it("fails when waitForTransaction fails", async () => {
      const { payload } = await createValidPayload();
      const signer = createMockSigner({
        waitForTransaction: async () => {
          throw new Error("timeout");
        },
      });
      const scheme = new ExactCasperScheme(signer);

      const result = await scheme.settle(buildPaymentPayload(payload), buildRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrSettleFailed);
      expect(result.errorMessage).toContain("timeout");
    });

    it("signs and submits a TransactionV1", async () => {
      const { payload } = await createValidPayload();
      const signed: TransactionV1[] = [];
      const submitted: TransactionV1[] = [];

      const signer = createMockSigner({
        signTransaction: async transaction => {
          signed.push(transaction);
        },
        putTransaction: async (_network, transaction) => {
          submitted.push(transaction);
          return "deploy-hash";
        },
      });

      const scheme = new ExactCasperScheme(signer);
      const result = await scheme.settle(buildPaymentPayload(payload), buildRequirements());

      expect(result.success).toBe(true);
      expect(signed.length).toBe(1);
      expect(submitted.length).toBe(1);
      expect(signed[0]).toBe(submitted[0]);
    });
  });
});
