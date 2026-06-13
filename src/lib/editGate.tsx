import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { clearPin, getPin, setStoredPin } from './pin';

interface EditGateState {
  /** True once a valid PIN has been entered this device. */
  unlocked: boolean;
  /** Resolves true if editing is allowed (prompts for the PIN if needed). */
  requireUnlock: () => Promise<boolean>;
  /** Forget the PIN and re-lock editing. */
  lock: () => void;
}

const EditGateContext = createContext<EditGateState | null>(null);

export function EditGateProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(() => Boolean(getPin()));
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const requireUnlock = useCallback(() => {
    if (unlocked) return Promise.resolve(true);
    setPin('');
    setErr(null);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, [unlocked]);

  const settle = useCallback((result: boolean) => {
    setOpen(false);
    setBusy(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }, []);

  const lock = useCallback(() => {
    clearPin();
    setUnlocked(false);
  }, []);

  const submit = useCallback(async () => {
    if (!/^\d{4}$/.test(pin)) {
      setErr('Enter the 4-digit PIN.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.verifyPin(pin);
      setStoredPin(pin);
      setUnlocked(true);
      settle(true);
    } catch (e) {
      clearPin();
      setErr(e instanceof Error ? e.message : 'Incorrect PIN.');
      setBusy(false);
    }
  }, [pin, settle]);

  return (
    <EditGateContext.Provider value={{ unlocked, requireUnlock, lock }}>
      {children}
      {open && (
        <div className="pin-overlay" role="dialog" aria-modal="true">
          <div className="pin-modal card">
            <h2>Enter PIN to edit</h2>
            <p className="hint">A 4-digit PIN is required to add or change records.</p>
            <input
              className="pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              autoFocus
              placeholder="••••"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
            {err && <p className="error">{err}</p>}
            <div className="pin-actions">
              <button
                className="ghost"
                type="button"
                onClick={() => settle(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="button"
                onClick={() => void submit()}
                disabled={busy || pin.length !== 4}
              >
                {busy ? 'Checking…' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </EditGateContext.Provider>
  );
}

export function useEditGate(): EditGateState {
  const ctx = useContext(EditGateContext);
  if (!ctx) throw new Error('useEditGate must be used within an EditGateProvider');
  return ctx;
}
