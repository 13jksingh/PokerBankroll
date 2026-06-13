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

/** ASCII signed amount for plain-text sharing, e.g. +120 or -45. */
export function signedAscii(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const abs = Math.abs(rounded);
  const text = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2);
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `-${text}`;
  return '0';
}

interface ShareEntry {
  name: string;
  net: number;
}

/** Builds the WhatsApp-style scoreboard text for a night (winners first). */
export function sessionToWhatsApp(
  date: string,
  entries: ShareEntry[],
  location?: string,
): string {
  const sorted = [...entries].sort((a, b) => b.net - a.net);
  const header = `🃏 Poker — ${formatDate(date)}${
    location ? ` @ ${location}` : ''
  }`;
  const lines = sorted.map(
    (e, i) => `${i === 0 ? '🏆 ' : ''}${e.name}: ${signedAscii(e.net)}`,
  );
  return [header, ...lines].join('\n');
}
