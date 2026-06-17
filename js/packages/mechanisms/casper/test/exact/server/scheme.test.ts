import { describe, expect, it } from "vitest";
import { ExactCasperScheme } from "../../../src/exact/server/scheme";

const testAsset = "aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788";
const testPayTo = "00aabbccddeeff0011223344556677889900aabbccddeeff001122334455667788";
const testNetwork = "casper:casper-test";

function buildRequirements(
  overrides?: Partial<{
    asset: string;
    amount: string;
    payTo: string;
    extra: Record<string, unknown>;
  }>,
): Parameters<ExactCasperScheme["enhancePaymentRequirements"]>[0] {
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

describe("ExactCasperScheme", () => {
  describe("parsePrice", () => {
    it("returns explicit AssetAmount with extra preserved", async () => {
      const scheme = new ExactCasperScheme();

      const result = await scheme.parsePrice(
        {
          amount: "1000000",
          asset: testAsset,
          extra: { name: "MyToken", version: "1" },
        },
        testNetwork,
      );

      expect(result.amount).toBe("1000000");
      expect(result.asset).toBe(testAsset);
      expect(result.extra).toMatchObject({ name: "MyToken", version: "1" });
    });

    it("returns explicit AssetAmount without extra with default empty extra", async () => {
      const scheme = new ExactCasperScheme();

      const result = await scheme.parsePrice(
        {
          amount: "500000",
          asset: testAsset,
        },
        testNetwork,
      );

      expect(result.amount).toBe("500000");
      expect(result.asset).toBe(testAsset);
      expect(result.extra).toEqual({});
    });

    it("throws for money string with no default asset or parser", async () => {
      const scheme = new ExactCasperScheme();

      await expect(scheme.parsePrice("1.00", testNetwork)).rejects.toThrow(
        "invalid_exact_casper_server_no_default_asset",
      );
    });

    it("throws for money float with no default asset or parser", async () => {
      const scheme = new ExactCasperScheme();

      await expect(scheme.parsePrice(1.0, testNetwork)).rejects.toThrow(
        "invalid_exact_casper_server_no_default_asset",
      );
    });

    it("returns custom parser result when registered", async () => {
      const scheme = new ExactCasperScheme();
      scheme.registerMoneyParser(async () => ({
        amount: "9999",
        asset: testAsset,
        extra: { name: "Custom", version: "2" },
      }));

      const result = await scheme.parsePrice(1.0, testNetwork);

      expect(result.amount).toBe("9999");
      expect(result.asset).toBe(testAsset);
      expect(result.extra).toMatchObject({ name: "Custom", version: "2" });
    });

    it("throws for invalid asset in map", async () => {
      const scheme = new ExactCasperScheme();

      await expect(
        scheme.parsePrice({ amount: "1000000", asset: "not-valid" }, testNetwork),
      ).rejects.toThrow("invalid_exact_casper_server_invalid_asset");
    });
  });

  describe("enhancePaymentRequirements", () => {
    it("returns requirements unchanged on happy path", async () => {
      const scheme = new ExactCasperScheme();

      const result = await scheme.enhancePaymentRequirements(
        buildRequirements({
          extra: { name: "TestToken", version: "1" },
        }),
        { x402Version: 1, scheme: "exact", network: testNetwork },
        [],
      );

      expect(result.amount).toBe("1000000");
      expect(result.asset).toBe(testAsset);
      expect(result.extra).toMatchObject({ name: "TestToken", version: "1" });
    });

    it("converts decimal amount using registered asset decimals", async () => {
      const scheme = new ExactCasperScheme();
      scheme.registerAsset(testNetwork, testAsset, 6);

      const result = await scheme.enhancePaymentRequirements(
        buildRequirements({ amount: "1.5" }),
        { x402Version: 1, scheme: "exact", network: testNetwork },
        [],
      );

      expect(result.amount).toBe("1500000");
    });

    it("throws when token name is missing", async () => {
      const scheme = new ExactCasperScheme();

      await expect(
        scheme.enhancePaymentRequirements(
          buildRequirements({ extra: { version: "1" } }),
          { x402Version: 1, scheme: "exact", network: testNetwork },
          [],
        ),
      ).rejects.toThrow("invalid_exact_casper_server_missing_token_name");
    });

    it("throws when token version is missing", async () => {
      const scheme = new ExactCasperScheme();

      await expect(
        scheme.enhancePaymentRequirements(
          buildRequirements({ extra: { name: "TestToken" } }),
          { x402Version: 1, scheme: "exact", network: testNetwork },
          [],
        ),
      ).rejects.toThrow("invalid_exact_casper_server_missing_token_version");
    });

    it("throws for invalid asset", async () => {
      const scheme = new ExactCasperScheme();

      await expect(
        scheme.enhancePaymentRequirements(
          buildRequirements({ asset: "too-short" }),
          { x402Version: 1, scheme: "exact", network: testNetwork },
          [],
        ),
      ).rejects.toThrow("invalid_exact_casper_server_invalid_asset");
    });

    it("throws for invalid payTo", async () => {
      const scheme = new ExactCasperScheme();

      await expect(
        scheme.enhancePaymentRequirements(
          buildRequirements({ payTo: "invalid" }),
          { x402Version: 1, scheme: "exact", network: testNetwork },
          [],
        ),
      ).rejects.toThrow("invalid_exact_casper_server_invalid_payto");
    });

    it("forwards extension keys from supportedKind extra", async () => {
      const scheme = new ExactCasperScheme();

      const result = await scheme.enhancePaymentRequirements(
        buildRequirements({ extra: { name: "T", version: "1" } }),
        {
          x402Version: 1,
          scheme: "exact",
          network: testNetwork,
          extra: { customKey: "customValue" },
        },
        ["customKey"],
      );

      expect(result.extra.customKey).toBe("customValue");
    });
  });

  describe("getAssetDecimals", () => {
    it("returns registered decimals", () => {
      const scheme = new ExactCasperScheme();
      scheme.registerAsset(testNetwork, testAsset, 9);

      expect(scheme.getAssetDecimals(testAsset, testNetwork)).toBe(9);
    });

    it("falls back to default of 9 for unknown assets", () => {
      const scheme = new ExactCasperScheme();

      expect(scheme.getAssetDecimals("unknown", testNetwork)).toBe(9);
    });
  });
});
