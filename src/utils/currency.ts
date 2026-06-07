const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',  EUR: '€',  GBP: '£',  TRY: '₺',
  JPY: '¥',  CAD: 'CA$', AUD: 'A$', CHF: 'Fr',
  INR: '₹',  BRL: 'R$',  MXN: 'MX$', KRW: '₩',
  CNY: '¥',  SEK: 'kr',  NOK: 'kr',  DKK: 'kr',
  HKD: 'HK$', SGD: 'S$', NZD: 'NZ$', ZAR: 'R',
  AED: 'د.إ', SAR: 'ر.س', QAR: 'ر.ق',
};

/** Returns the symbol for a currency code, falling back to the code itself. */
export function currencySymbol(code?: string): string {
  if (!code) return '$';
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? '$';
}

/** Formats an amount with its currency symbol: "$1,234.56" */
export function formatCurrency(amount: number, code?: string): string {
  const sym = currencySymbol(code);
  return `${sym}${amount.toFixed(2)}`;
}
