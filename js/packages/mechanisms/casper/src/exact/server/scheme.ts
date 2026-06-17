import {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  MoneyParser,
  SupportedKind,
} from "@x402/core/types";
import { parseMoneyString } from "@x402/core/utils";
import { isValidAddress, isValidContractPackageHash, parseAmount } from "../../utils";

export const ErrNoDefaultAsset = "invalid_exact_casper_server_no_default_asset";
export const ErrInvalidAsset = "invalid_exact_casper_server_invalid_asset";
export const ErrInvalidPayTo = "invalid_exact_casper_server_invalid_payto";
export const ErrMissingTokenName = "invalid_exact_casper_server_missing_token_name";
export const ErrMissingTokenVersion = "invalid_exact_casper_server_missing_token_version";
export const ErrFailedToParseAmount = "invalid_exact_casper_server_failed_to_parse_amount";

/**
 * Build a lookup key for the asset decimals registry.
 *
 * @param network - The network identifier
 * @param asset - The asset contract package hash
 * @returns Registry key
 */
function assetDecimalsKey(network: Network, asset: string): string {
  return `${network}:${asset}`;
}

/**
 * Casper server implementation for the Exact payment scheme.
 */
export class ExactCasperScheme implements SchemeNetworkServer {
  readonly scheme = "exact";
  private moneyParsers: MoneyParser[] = [];
  private assetDecimals = new Map<string, number>();

  /**
   * Register a custom money parser in the parser chain.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The server instance for chaining
   */
  registerMoneyParser(parser: MoneyParser): ExactCasperScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Register the decimal precision for an asset on a network.
   *
   * @param network - The network identifier
   * @param asset - The asset contract package hash
   * @param decimals - Number of decimal places
   * @returns The server instance for chaining
   */
  registerAsset(network: Network, asset: string, decimals: number): ExactCasperScheme {
    this.assetDecimals.set(assetDecimalsKey(network, asset), decimals);
    return this;
  }

  /**
   * Get the decimal precision for an asset on a network.
   *
   * @param asset - The asset contract package hash
   * @param network - The network identifier
   * @returns Number of decimal places
   */
  getAssetDecimals(asset: string, network: Network): number {
    return this.assetDecimals.get(assetDecimalsKey(network, asset)) ?? 9;
  }

  /**
   * Parse a price into an asset amount.
   *
   * @param price - The price to parse
   * @param network - The network to use
   * @returns Promise resolving to the parsed asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!isValidContractPackageHash(price.asset)) {
        throw new Error(`${ErrInvalidAsset}: ${price.asset}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    const amount = this.parseMoneyToDecimal(price);

    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    throw new Error(`${ErrNoDefaultAsset}: no default asset configured for network ${network}`);
  }

  /**
   * Build payment requirements for this scheme/network combination.
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind from facilitator
   * @param extensionKeys - Extension keys supported by the facilitator
   * @returns Enhanced payment requirements
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: SupportedKind,
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    if (!isValidContractPackageHash(paymentRequirements.asset)) {
      throw new Error(`${ErrInvalidAsset}: ${paymentRequirements.asset}`);
    }

    if (!isValidAddress(paymentRequirements.payTo)) {
      throw new Error(`${ErrInvalidPayTo}: ${paymentRequirements.payTo}`);
    }

    let amount = paymentRequirements.amount;
    if (amount.includes(".")) {
      const decimals = this.getAssetDecimals(
        paymentRequirements.asset,
        paymentRequirements.network,
      );
      try {
        amount = parseAmount(amount, decimals).toString();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${ErrFailedToParseAmount}: ${message}`);
      }
    }

    const extra = { ...paymentRequirements.extra };

    if (typeof extra.name !== "string" || extra.name === "") {
      throw new Error(ErrMissingTokenName);
    }
    if (typeof extra.version !== "string" || extra.version === "") {
      throw new Error(ErrMissingTokenVersion);
    }

    if (supportedKind.extra) {
      for (const key of extensionKeys) {
        if (Object.hasOwn(supportedKind.extra, key)) {
          extra[key] = supportedKind.extra[key];
        }
      }
    }

    return {
      ...paymentRequirements,
      amount,
      extra,
    };
  }

  /**
   * Parse Money (string | number) to a decimal number.
   *
   * @param money - The money value to parse
   * @returns Decimal number
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === "number") {
      return money;
    }

    return parseMoneyString(money);
  }
}
