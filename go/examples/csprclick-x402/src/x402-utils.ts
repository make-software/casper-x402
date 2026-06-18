export type PaymentRequirement = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    decimals?: string;
    name?: string;
    symbol?: string;
    version?: string;
  };
};

export type PaymentRequiredHeader = {
  x402Version: number;
  error: string;
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepts: PaymentRequirement[];
};

export function parseBase64Json<T>(value: string): T {
  return JSON.parse(atob(value)) as T;
}

export function parseAmount(amount: string): number {
  const parsed = Number(amount);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Unsupported payment amount: ${amount}`);
  }
  return parsed;
}

export function formatDisplayAmount(amount: string, decimals?: string, symbol?: string): string {
  if (!/^\d+$/.test(amount)) {
    return symbol ? `${amount} ${symbol}` : amount;
  }

  const parsedDecimals = Number(decimals ?? '0');
  const safeDecimals =
    Number.isInteger(parsedDecimals) && parsedDecimals >= 0 ? parsedDecimals : 0;

  const paddedAmount = amount.padStart(safeDecimals + 1, '0');
  const integerPartRaw =
    safeDecimals === 0 ? paddedAmount : paddedAmount.slice(0, -safeDecimals);
  const fractionPart =
    safeDecimals === 0 ? '' : paddedAmount.slice(-safeDecimals);
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, '');
  const groupedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formattedNumber =
    safeDecimals === 0
      ? groupedIntegerPart
      : `${groupedIntegerPart},${fractionPart}`;

  return symbol ? `${formattedNumber} ${symbol}` : formattedNumber;
}