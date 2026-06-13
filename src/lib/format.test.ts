import { describe, expect, it } from 'vitest';
import { signedAscii, sessionToWhatsApp } from './format';

describe('signedAscii', () => {
  it('formats positive, negative, and zero', () => {
    expect(signedAscii(120)).toBe('+120');
    expect(signedAscii(-45)).toBe('-45');
    expect(signedAscii(0)).toBe('0');
  });
});

describe('sessionToWhatsApp', () => {
  it('sorts winners first and marks the top with a trophy', () => {
    const text = sessionToWhatsApp('2026-05-02', [
      { name: 'Kamal', net: -240 },
      { name: 'Adit', net: 1590 },
      { name: 'Sagar', net: 250 },
    ]);
    const lines = text.split('\n');
    expect(lines[0]).toContain('Poker');
    expect(lines[1]).toBe('🏆 Adit: +1590');
    expect(lines[2]).toBe('Sagar: +250');
    expect(lines[3]).toBe('Kamal: -240');
  });

  it('includes location when provided', () => {
    const text = sessionToWhatsApp(
      '2026-05-02',
      [
        { name: 'A', net: 10 },
        { name: 'B', net: -10 },
      ],
      "Sam's place",
    );
    expect(text.split('\n')[0]).toContain("@ Sam's place");
  });
});
