import { useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { setGetTokenFn, getClerkToken, clearClerkToken } from '../../lib/api/authTokenStore';

const REFRESH_INTERVAL_MS = 55_000; // Clerk tokens expire in 60 s

export function ClerkTokenSync(): null {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      clearClerkToken();
      return;
    }
    setGetTokenFn(getToken);
    getClerkToken().catch(() => {/* silencioso */});
    const id = setInterval(() => {
      getClerkToken().catch(() => {/* silencioso */});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [getToken, isSignedIn]);

  return null;
}
