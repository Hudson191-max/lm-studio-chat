/**
 * Format a token count with smart compact notation.
 *
 *   42           → "42"
 *   1500         → "1.5k"
 *   1000         → "1k"       (whole thousands drop the .0)
 *   100000       → "100k"
 *   1500000      → "1.5m"
 *   1000000      → "1m"
 *   2000000000   → "2b"
 *
 * Used by: chat footer token indicator, admin usage bars, admin stats
 * cards, settings dialog context length labels.
 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1e9) return compact(n / 1e9, 'b')
  if (n >= 1e6) return compact(n / 1e6, 'm')
  if (n >= 1e3) return compact(n / 1e3, 'k')
  return String(Math.round(n))
}

/** Format with one decimal place, dropping ".0" for whole numbers. */
function compact(value: number, suffix: string): string {
  // Round to one decimal first, then decide whether to show the decimal.
  const rounded = Math.round(value * 10) / 10
  if (Number.isInteger(rounded)) {
    return `${rounded}${suffix}`
  }
  return `${rounded.toFixed(1)}${suffix}`
}
