import { getContainer } from './store.js';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const SECURITY_PARTITION = '__security__';

interface PinThrottleDocument {
  id: string;
  tableId: typeof SECURITY_PARTITION;
  type: 'security';
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
  _etag?: string;
}

function freshDocument(id: string, now: number): PinThrottleDocument {
  return {
    id,
    tableId: SECURITY_PARTITION,
    type: 'security',
    failures: 0,
    windowStartedAt: now,
    blockedUntil: 0,
  };
}

function isCosmosStatus(error: unknown, statusCode: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Number((error as { code?: unknown }).code) === statusCode
  );
}

async function readThrottle(
  id: string,
): Promise<PinThrottleDocument | undefined> {
  try {
    const { resource } = await getContainer()
      .item(id, SECURITY_PARTITION)
      .read<PinThrottleDocument>();
    return resource;
  } catch (error) {
    if (isCosmosStatus(error, 404)) return undefined;
    throw error;
  }
}

/**
 * Serializes PIN attempts per client with Cosmos optimistic concurrency.
 * A correct PIN is still denied while a client is temporarily blocked.
 */
export async function consumePinAttempt(
  id: string,
  pinMatches: boolean,
  maxAttempts = MAX_ATTEMPTS,
  resetOnSuccess = true,
): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const now = Date.now();
    const current = await readThrottle(id);

    if (!current) {
      if (pinMatches) return true;
      const created = freshDocument(id, now);
      created.failures = 1;
      try {
        await getContainer().items.create(created);
        return false;
      } catch (error) {
        if (isCosmosStatus(error, 409)) continue;
        throw error;
      }
    }

    if (current.blockedUntil > now) return false;
    if (pinMatches && !resetOnSuccess) return true;

    const expired = now - current.windowStartedAt >= WINDOW_MS;
    const failures = pinMatches ? 0 : (expired ? 0 : current.failures) + 1;
    const next: PinThrottleDocument = {
      ...current,
      failures,
      windowStartedAt: expired ? now : current.windowStartedAt,
      blockedUntil:
        !pinMatches && failures >= maxAttempts ? now + WINDOW_MS : 0,
    };

    try {
      await getContainer()
        .item(id, SECURITY_PARTITION)
        .replace(next, {
          accessCondition: {
            type: 'IfMatch',
            condition: current._etag || '',
          },
        });
      return pinMatches && next.blockedUntil === 0;
    } catch (error) {
      if (isCosmosStatus(error, 412)) continue;
      throw error;
    }
  }

  return false;
}
