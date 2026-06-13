/** Local persistence for the editing PIN (verified server-side on use). */

const PIN_KEY = 'pokerbankroll.pin.v1';

export function getPin(): string | null {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

export function setStoredPin(pin: string): void {
  try {
    localStorage.setItem(PIN_KEY, pin);
  } catch {
    /* ignore quota errors */
  }
}

export function clearPin(): void {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore */
  }
}

/** True when an API error indicates the PIN is missing or wrong. */
export function isPinError(message: string): boolean {
  return /pin/i.test(message);
}
