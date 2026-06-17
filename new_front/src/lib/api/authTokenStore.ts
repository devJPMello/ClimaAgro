let _cachedToken: string | null = null;
let _getTokenFn: (() => Promise<string | null>) | null = null;

export function setGetTokenFn(fn: () => Promise<string | null>): void {
  _getTokenFn = fn;
}

/** Sync read — returns the last-cached token (may be null or slightly stale). */
export function getCachedClerkToken(): string | null {
  return _cachedToken;
}

/** Async read — refreshes via Clerk if possible, returns cached value on failure. */
export async function getClerkToken(): Promise<string | null> {
  if (!_getTokenFn) return _cachedToken;
  try {
    const token = await _getTokenFn();
    if (token) _cachedToken = token;
    return _cachedToken;
  } catch {
    return _cachedToken;
  }
}

export function clearClerkToken(): void {
  _cachedToken = null;
  _getTokenFn = null;
}
