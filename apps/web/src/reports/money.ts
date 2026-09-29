/** Falls back to "12.50 XYZ" for a code the browser does not know. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
