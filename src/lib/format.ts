/** Formats a number as a signed currency-ish amount, e.g. +120 or -45. */
export function formatNet(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '\u2212' : '';
  const abs = Math.abs(rounded);
  const text = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2);
  return `${sign}${text}`;
}

export function netClass(value: number): 'pos' | 'neg' | 'zero' {
  if (value > 0) return 'pos';
  if (value < 0) return 'neg';
  return 'zero';
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
